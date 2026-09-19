/**
 * FFmpeg argument building for the video compression middleware.
 *
 * @module httpMiddleware/builtin/video/options
 */

import type { VideoCompressionOptions } from "./httpMiddleware.video.js";

const DEFAULT_CRF = 28;
const DEFAULT_PRESET = "medium";
export const DEFAULT_VIDEO_FORMAT = "mp4";

/** Media type per output container. */
export const CONTAINER_TYPES: Readonly<Record<string, string>> = Object.freeze({
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
});

/** Builds the ffmpeg output options for a compression request. */
export function buildOutputOptions(options: VideoCompressionOptions): string[] {
  const output = [
    `-crf ${options.crf ?? DEFAULT_CRF}`,
    `-preset ${options.preset ?? DEFAULT_PRESET}`,
    /* A pipe is not seekable, so the moov atom must be fragmented. */
    "-movflags frag_keyframe+empty_moov",
  ];

  if (options.bitrate) {
    output.push(`-b:v ${options.bitrate}`);
  }

  if (options.scale?.width || options.scale?.height) {
    output.push(
      `-vf scale=${options.scale.width ?? -2}:${options.scale.height ?? -2}`,
    );
  }

  return output;
}

