function buildFfmpegArgs(rtspUrl) {
  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-rtsp_transport', 'tcp',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-max_delay', '500000',
    '-analyzeduration', '1000000',
    '-probesize', '1000000',
    '-i', rtspUrl,
    '-an',
    '-sn',
    '-dn',
    '-threads', '1',
    '-q:v', '5',
    '-r', '8',
    '-f', 'mpjpeg',
    '-boundary_tag', 'frame',
    '-',
  ];
}

module.exports = { buildFfmpegArgs };
