#!/usr/bin/env python3
"""The reviewer's tree tests (round 11, must-fix 4), measured on tools/tree-check.js's mask passes:
one tree drawn flat — leaves green, wood red — against a pure blue sky.

  python3 tools/tree-metrics.py shots/treecheck-<tag>-*-mask.png

For each mask:
  sky     the share of the crown's pixels that show sky (test: 4–12%). The crown is the leaves'
          outline closed by a disc of 3% of its width and its holes filled — so a gap between two
          leaves or two sprays counts as sky seen through the crown, a notch wider than the disc
          doesn't (2% and 5% discs printed too).
  edge    the longest straight run of the crown's outline, as a share of its width (test: ≤ 15%):
          the longest stretch of the outline whose every point lies within 1 px of the chord
          between its ends.
  limbs   wood entering the crown (test: ≥ 3): the most separate runs of wood, at least 2 px wide,
          across any row of the crown's lower half where leaves are, inside its outline.
  taper   the trunk's width at its base over its width where it meets the crown (test: ≥ 1.3):
          the wood's run under the crown's middle, at the lowest rows and just under the crown.
Needs numpy, scipy, Pillow and scikit-image.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure


def disc(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def longest_straight(cont, tol=1.0):
    """The longest chord whose stretch of outline stays within tol px of it (closed contour)."""
    n = len(cont)
    if n < 3:
        return 0.0
    P = np.concatenate([cont, cont])  # (wraps round)
    best = 0.0
    j = 1
    for i in range(n):
        j = max(j, i + 1)
        while j + 1 < i + n:
            a, b = P[i], P[j + 1]
            d = b - a
            L = np.hypot(*d)
            if L < 1e-9:
                j += 1
                continue
            seg = P[i:j + 2]
            dev = np.abs((seg[:, 0] - a[0]) * d[1] - (seg[:, 1] - a[1]) * d[0]) / L
            if dev.max() > tol:
                break
            j += 1
        best = max(best, float(np.hypot(*(P[j] - P[i]))))
    return best


def measure_mask(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    leaf = (a[..., 1] > 128) & (a[..., 0] < 128) & (a[..., 2] < 128)
    wood = (a[..., 0] > 128) & (a[..., 1] < 128) & (a[..., 2] < 128)
    if leaf.sum() < 50:
        return None
    ys, xs = np.nonzero(leaf)
    W = xs.max() - xs.min() + 1
    out = {'crown_w_px': int(W)}
    # the crown's outline: the leaves closed by a disc, holes filled; its largest piece
    for pct in (2, 3, 5):
        r = max(1, int(round(W * pct / 100)))
        pad = r + 2
        L = np.pad(leaf, pad)
        env = ndi.binary_fill_holes(ndi.binary_closing(L, structure=disc(r)))[pad:-pad, pad:-pad]
        lab, n = ndi.label(env)
        if n > 1:
            env = lab == (np.argmax(ndi.sum(env, lab, range(1, n + 1))) + 1)
        sky = env & ~leaf & ~wood
        out[f'sky_{pct}'] = float(sky.sum() / max(1, env.sum()))
        if pct == 3:
            crown = env
    # the outline's longest straight run (the leaves' own outline, holes filled)
    filled = ndi.binary_fill_holes(leaf)
    lab, n = ndi.label(filled)
    if n > 1:
        filled = lab == (np.argmax(ndi.sum(filled, lab, range(1, n + 1))) + 1)
    cs = measure.find_contours(np.pad(filled, 1).astype(float), 0.5)
    cont = max(cs, key=len) - 1
    # only the outline against the sky counts: not where it runs along the frame's edge, nor where
    # a limb or the trunk borders the leaves (that edge is the wood's, inside the tree's silhouette)
    H_, W_ = leaf.shape
    on_edge = (cont[:, 0] <= 0.5) | (cont[:, 0] >= H_ - 1.5) | (cont[:, 1] <= 0.5) | (cont[:, 1] >= W_ - 1.5)
    near_wood = ndi.binary_dilation(wood, structure=disc(2))
    ci = np.clip(np.round(cont).astype(int), 0, [H_ - 1, W_ - 1])
    breaks = on_edge | near_wood[ci[:, 0], ci[:, 1]]
    out['outline_sky_share'] = float(1 - breaks.mean())
    best = {}
    for tol in (1.0, 1.5):
        bb = 0.0
        if breaks.any():
            idx = np.nonzero(~breaks)[0]
            if len(idx):
                for r_ in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
                    if len(r_) > 2:
                        bb = max(bb, longest_open(cont[r_], tol))
        else:
            bb = longest_straight(cont, tol)
        best[tol] = bb
    out['edge'] = best[1.0] / W
    out['edge_tol1_5'] = best[1.5] / W
    # limbs entering: separate wood runs across the crown's lower half, inside the outline
    cy0, cy1 = np.nonzero(crown.any(axis=1))[0][[0, -1]]
    lower = range(int(cy0 + (cy1 - cy0) * 0.5), int(cy1) + 1)
    most = 0
    for y in lower:
        row = wood[y] & crown[y]
        lab, n = ndi.label(row)
        n2 = sum(1 for k in range(1, n + 1) if (lab == k).sum() >= 2)
        most = max(most, n2)
    out['limbs'] = most
    # the trunk: the wood under the crown, its run nearest the crown's middle column
    cx = (xs.min() + xs.max()) / 2
    trunk_rows = [y for y in range(int(cy1) + 1, wood.shape[0]) if wood[y].any()]
    def width_at(y):
        lab, n = ndi.label(wood[y])
        if not n:
            return 0
        sizes = [(abs(np.nonzero(lab == k)[0].mean() - cx), (lab == k).sum()) for k in range(1, n + 1)]
        return min(sizes)[1]
    if len(trunk_rows) >= 6:
        base = np.median([width_at(y) for y in trunk_rows[-4:]])
        top = np.median([width_at(y) for y in trunk_rows[:4]])
        out['taper'] = float(base / max(1, top))
        out['trunk_px'] = [float(base), float(top)]
    return out


def longest_open(seg, tol):
    n = len(seg)
    best, j = 0.0, 1
    for i in range(n - 1):
        j = max(j, i + 1)
        while j + 1 < n:
            a, b = seg[i], seg[j + 1]
            d = b - a
            L = np.hypot(*d)
            if L < 1e-9:
                j += 1
                continue
            s = seg[i:j + 2]
            dev = np.abs((s[:, 0] - a[0]) * d[1] - (s[:, 1] - a[1]) * d[0]) / L
            if dev.max() > tol:
                break
            j += 1
        best = max(best, float(np.hypot(*(seg[j] - seg[i]))))
    return best


if __name__ == '__main__':
    for p in sys.argv[1:]:
        m = measure_mask(p)
        if not m:
            print(f'{p}: no crown in the mask')
            continue
        ok = lambda c: 'pass' if c else 'FAIL'
        s = m['sky_3']
        print(f"{p}\n  sky through the crown {s * 100:.1f}% (2%: {m['sky_2'] * 100:.1f}, 5%: {m['sky_5'] * 100:.1f}) [{ok(0.04 <= s <= 0.12)}]"
              f"\n  longest straight edge {m['edge'] * 100:.1f}% of the crown's width ({m['crown_w_px']} px; at 1.5 px {m['edge_tol1_5'] * 100:.1f}%) [{ok(m['edge'] <= 0.15)}]"
              f"\n  limbs entering the crown {m['limbs']} [{ok(m['limbs'] >= 3)}]"
              + (f"\n  trunk base / top {m['taper']:.2f} ({m['trunk_px'][0]:.0f} / {m['trunk_px'][1]:.0f} px) [{ok(m['taper'] >= 1.3)}]" if 'taper' in m else '\n  trunk: not in view'))
