/**
 * How far the shell sinks beneath the streamed ring, in metres.
 *
 * The shell samples the same height field as the streamed chunks but at 10.67 m
 * where the near chunks use 2.67 m, so between shared lattice points it misses
 * the true surface. Measured across the shipped world, the current shell stays
 * within 1.18 m at the 99th percentile; the remaining worst cases are confined
 * to the steepest mountain faces. Sinking by three metres buries the shell
 * under the streamed terrain everywhere the two overlap in ordinary ground,
 * which is what stops the coarse mesh poking through the fine one.
 *
 * It is deliberately not sized for that 17.6 m worst case. A sink deep enough
 * to cover a cliff face would leave a trench everywhere else, and the ramp
 * below only has one chunk of width to climb out of it.
 */
export const WORLD_HORIZON_SINK_DEPTH = 3;

/**
 * Build budget per frame, in milliseconds.
 *
 * The shell is built once and never rebuilt, so this only governs how quickly
 * the far horizon fills in after load. It shares the terrain streamer's frame
 * deadline, so this ceiling only applies when terrain has budget left over.
 */
export const WORLD_HORIZON_BUILD_BUDGET_MS = 1.5;

/**
 * Vertices shaded per deadline check during the build.
 *
 * Each vertex costs an ecology sample and a colour resolve, so checking the
 * clock every vertex would spend a noticeable share of the budget reading the
 * clock. Sixty-four is small enough to keep the overshoot under a tenth of a
 * millisecond.
 */
export const WORLD_HORIZON_BUILD_BATCH = 64;

/**
 * Render order for the shell: after the streamed terrain, before water.
 *
 * Drawing the shell after terrain lets early-Z reject the two thirds of it that
 * sit buried under the streamed ring, so the buried majority costs geometry
 * throughput but almost no shading.
 */
export const WORLD_HORIZON_RENDER_ORDER = 1.5;
