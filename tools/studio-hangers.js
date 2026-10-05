// The tree studio's hangers (tools/tree-shots.js opts.extra): each tree dressed with what grows on it
// — Spanish moss, resurrection fern, ball moss or lace lichen (assets/hangers.ts), the heavy load in
// the first tone — so the studio row shows a tree as its region hangs it.
//   node tools/tree-studio.mjs --tag=x --kinds=liveoak --extra=/tools/studio-hangers.js
export default async function (kind, v, THREE) {
  const { hangerLib, HANG_TONES } = await import('/src/assets/hangers.ts');
  const by = { liveoak: ['spanish', 'resfern'], plateauoak: ['ballmoss'], coastoak: ['lace'], oak: ['spanish'], round: ['spanish'], elm: ['ballmoss'] }[kind] ?? [];
  return by.map((type) => {
    const g = hangerLib(type, kind, v, v === 1 ? 0 : 1).clone(), c = new THREE.Color(HANG_TONES[type][0]);
    const col = g.getAttribute('color');
    for (let i = 0; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b);
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  });
}
