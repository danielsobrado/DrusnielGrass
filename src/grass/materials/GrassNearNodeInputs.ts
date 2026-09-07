import { Color, Vector2, Vector4, type Node, type TextureNode } from "three/webgpu";
import type { IUniform } from "three";
import { reference, uniformArray } from "three/tsl";
import { createUniformTexture, type UniformTexture } from "../../render/NodeUniformTexture";

function cached<T>(resolve: (name: string) => T): (name: string) => T {
  const nodes = new Map<string, T>();
  return name => {
    if (!nodes.has(name)) nodes.set(name, resolve(name));
    return nodes.get(name)!;
  };
}

/**
 * Binds the node materials to the grass material's existing uniform table.
 *
 * Every `configure`, art-direction, LOD and quality setter keeps writing the
 * same `IUniform` objects it always did; scalars and vectors are read back
 * through `reference`, palette rows through `uniformArray` over the same
 * `Color`/`Vector2` instances the balancer mutates in place. Nothing here owns
 * grass state — a second copy of it is exactly what would let the legacy and
 * node paths drift apart while both are alive.
 */
export function createGrassNodeUniforms(values: Record<string, IUniform>) {
  const textures: UniformTexture[] = [];
  return {
    number: cached((name: string): Node<"float"> => {
      if (typeof values[name]?.value !== "number") throw new Error(`Missing grass scalar ${name}`);
      return reference("value", "float", values[name]);
    }),
    vector2: cached((name: string): Node<"vec2"> => {
      if (!(values[name]?.value instanceof Vector2)) throw new Error(`Missing grass vector ${name}`);
      return reference("value", "vec2", values[name]);
    }),
    vector4: cached((name: string): Node<"vec4"> => {
      if (!(values[name]?.value instanceof Vector4)) throw new Error(`Missing grass vector ${name}`);
      return reference("value", "vec4", values[name]);
    }),
    color: cached((name: string): Node<"vec3"> => {
      if (!(values[name]?.value instanceof Color)) throw new Error(`Missing grass color ${name}`);
      return reference("value", "color", values[name]).rgb;
    }),
    // Color arrays must keep the color type: a vec3 upload reads x/y/z while
    // Color stores r/g/b, even though both compile to a shader vec3.
    colorRows: cached((name: string) => {
      const rows = values[name]?.value;
      if (!Array.isArray(rows) || !(rows[0] instanceof Color)) throw new Error(`Missing grass palette rows ${name}`);
      return uniformArray<"color">(rows as Color[], "color");
    }),
    vector2Rows: cached((name: string) => {
      const rows = values[name]?.value;
      if (!Array.isArray(rows) || !(rows[0] instanceof Vector2)) throw new Error(`Missing grass shade rows ${name}`);
      return uniformArray<"vec2">(rows as Vector2[], "vec2");
    }),
    /** Optional samplers stay bound before their field exists. */
    texture: cached((name: string): TextureNode => {
      const source = values[name];
      if (!source) throw new Error(`Missing grass texture ${name}`);
      const bound = createUniformTexture(source);
      textures.push(bound);
      return bound.node;
    }),
    /** Called from the material's own update; the trail map is swapped per frame. */
    syncTextures(): void {
      for (const bound of textures) bound.sync();
    },
    dispose(): void {
      for (const bound of textures) bound.dispose();
      textures.length = 0;
    },
  };
}

export type GrassNodeUniforms = ReturnType<typeof createGrassNodeUniforms>;
