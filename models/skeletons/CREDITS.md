# Skeleton characters

**KayKit Character Pack: Skeletons (1.0)** by [Kay Lousberg](https://kaylousberg.com).

- Source: <https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0>
- Licence: [CC0 1.0 Universal](http://creativecommons.org/publicdomain/zero/1.0/) — see `LICENSE.txt`.
- Attribution is not required by the licence. It is given here because credit is
  the decent thing to do for work released this generously.

## What was changed

`scripts/prepare-character-assets.mjs` makes two changes and repacks the binary
chunk, dropping every buffer view left unreferenced:

1. **Baked animation clips are stripped.** Each upstream file carries 95 of
   them, which is most of its weight. This project animates imported characters
   through its own actor runtime rather than playing clips.
2. **Embedded imagery is stripped.** All four characters share one gradient
   atlas, so embedding a copy per file wasted both download and a GPU texture —
   and the runtime would have had to fetch each copy back out through a `blob:`
   URL, which the site's `connect-src 'self'` policy correctly refuses. The
   atlas ships once as `skeleton_texture.png` and is applied at load time.

| Model | Upstream | Shipped |
| --- | --- | --- |
| `Skeleton_Mage.glb` | 4.76 MB | 0.25 MB |
| `Skeleton_Minion.glb` | 4.81 MB | 0.31 MB |
| `Skeleton_Rogue.glb` | 4.83 MB | 0.32 MB |
| `Skeleton_Warrior.glb` | 4.86 MB | 0.36 MB |
| `skeleton_texture.png` | — | 0.02 MB |

Total: 19.3 MB upstream, 1.3 MB shipped. Meshes, skin, skeleton, and the atlas
itself are otherwise untouched. To refresh from a
newer upstream release, clone the pack and re-run:

```
node scripts/prepare-character-assets.mjs <pack>/Characters/gltf public/models/skeletons
```
