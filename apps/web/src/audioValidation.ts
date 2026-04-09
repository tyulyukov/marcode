interface AudioMagic {
  readonly offset: number;
  readonly bytes: readonly number[];
}

const AUDIO_MAGIC_SIGNATURES: readonly AudioMagic[] = [
  // MP3 — ID3v2 tag header
  { offset: 0, bytes: [0x49, 0x44, 0x33] },
  // MP3 — MPEG frame sync words
  { offset: 0, bytes: [0xff, 0xfb] },
  { offset: 0, bytes: [0xff, 0xf3] },
  { offset: 0, bytes: [0xff, 0xf2] },
  // WAV — RIFF container
  { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  // OGG (Vorbis/Opus)
  { offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] },
  // FLAC
  { offset: 0, bytes: [0x66, 0x4c, 0x61, 0x43] },
  // M4A/AAC — ISO BMFF ftyp box
  { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  // WebM/Matroska — EBML header
  { offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  // AIFF
  { offset: 0, bytes: [0x46, 0x4f, 0x52, 0x4d] },
];

const MAX_HEADER_BYTES = 12;

function matchesMagic(header: Uint8Array, magic: AudioMagic): boolean {
  for (let i = 0; i < magic.bytes.length; i++) {
    if (header[magic.offset + i] !== magic.bytes[i]) return false;
  }
  return true;
}

export async function isValidAudioFile(file: File): Promise<boolean> {
  if (file.type && file.type.startsWith("audio/")) {
    return true;
  }

  const slice = file.slice(0, MAX_HEADER_BYTES);
  const buffer = await slice.arrayBuffer();
  const header = new Uint8Array(buffer);

  return AUDIO_MAGIC_SIGNATURES.some((magic) => {
    if (magic.offset + magic.bytes.length > header.length) return false;
    return matchesMagic(header, magic);
  });
}
