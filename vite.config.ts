import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import packageMetadata from "./package.json";

const DEPLOYMENT_BASE_PATH = "./";
const SOURCE_ARCHIVE_REVISION = "archive";
const SOURCE_ARCHIVE_BUILD_LABEL = "source-archive";
const PUBLIC_ASSET_PATH_PATTERN =
	/(["'`])\/([^"'`]+\.(?:avif|basis|bin|exr|gif|glb|gltf|hdr|jpe?g|ktx2|mp3|ogg|png|svg|wav|webp))\1/g;
const STONE_GRAIN_ASSET_PATTERN = /(["'`])\.\/perlinnoise\.webp\1/g;

function runGit(args: string[]): string | undefined {
	try {
		const output = execFileSync("git", args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return output.length > 0 ? output : undefined;
	} catch {
		return undefined;
	}
}

function resolveSourceRevision(): string {
	return runGit(["rev-parse", "--short=12", "HEAD"]) ?? SOURCE_ARCHIVE_REVISION;
}

function resolveBuildLabel(): string {
	return runGit(["show", "-s", "--format=%cs", "HEAD"]) ?? SOURCE_ARCHIVE_BUILD_LABEL;
}

const SOURCE_REVISION = resolveSourceRevision();
const BUILD_LABEL = resolveBuildLabel();

function rewriteRootPublicAssetPaths(): Plugin {
	return {
		name: "rewrite-root-public-asset-paths",
		enforce: "pre",
		transform(source, id) {
			if (!id.includes("/src/")) {
				return null;
			}

			const relativeCode = source.replace(
				PUBLIC_ASSET_PATH_PATTERN,
				(_match, quote: string, assetPath: string) =>
					`${quote}${DEPLOYMENT_BASE_PATH}${assetPath}${quote}`
			);
			const code = relativeCode.replace(
				STONE_GRAIN_ASSET_PATTERN,
				(_match, quote: string) =>
					`${quote}${DEPLOYMENT_BASE_PATH}perlinnoise.webp?v=${encodeURIComponent(SOURCE_REVISION)}${quote}`
			);

			return code === source ? null : { code, map: null };
		},
	};
}

function includeLegalFiles(): Plugin {
	return {
		name: "include-legal-files",
		generateBundle() {
			for (const fileName of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
				this.emitFile({
					type: "asset",
					fileName,
					source: readFileSync(new URL(fileName, import.meta.url), "utf8"),
				});
			}
		},
	};
}

export default defineConfig({
	base: DEPLOYMENT_BASE_PATH,
	build: {
		sourcemap: false,
	},
	server: {
		watch: {
			ignored: ["**/.tmp-screenshots/**", "**/.shots/**"],
		},
	},
	define: {
		__APP_VERSION__: JSON.stringify(
			`v${packageMetadata.version}+${SOURCE_REVISION}`
		),
		__BUILD_LABEL__: JSON.stringify(BUILD_LABEL),
	},
	plugins: [rewriteRootPublicAssetPaths(), includeLegalFiles()],
});