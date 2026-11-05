export const MUSIC_TRACKS = Object.freeze([
  Object.freeze({
    id: 'original',
    src: '/music/color-your-night-loop.mp3',
    title: 'COLOR YOUR NIGHT',
    artist: 'LOTUS JUICE / AZUMI TAKAHASHI',
    mode: 'ORIG LOOP',
    loopStart: 6,
  }),
  Object.freeze({
    id: 'instrumental',
    src: '/music/color-your-night-instrumental-loop.mp3',
    title: 'COLOR YOUR NIGHT · INSTRUMENTAL',
    artist: 'REMI',
    mode: 'INST LOOP',
    loopStart: 6,
  }),
]);

export const DEFAULT_MUSIC_TRACK = MUSIC_TRACKS[0];

export function findMusicTrack(id) {
  return MUSIC_TRACKS.find(track => track.id === id) ?? DEFAULT_MUSIC_TRACK;
}

export function nextMusicTrack(id) {
  const index = MUSIC_TRACKS.findIndex(track => track.id === id);
  return MUSIC_TRACKS[(index < 0 ? 0 : index + 1) % MUSIC_TRACKS.length];
}
