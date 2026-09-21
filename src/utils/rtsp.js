export function buildRtspUrlWithAuth(rtspUrl, username, password) {
  if (!rtspUrl) return rtspUrl;
  if (!rtspUrl.startsWith('rtsp://')) return rtspUrl;
  if (!username || !password) return rtspUrl;

  const stripped = rtspUrl.replace(/^rtsp:\/\/[^@\/]*@/i, 'rtsp://');
  const rest = stripped.substring('rtsp://'.length);
  const userEnc = encodeURIComponent(username);
  const passEnc = encodeURIComponent(password);
  return `rtsp://${userEnc}:${passEnc}@${rest}`;
}
