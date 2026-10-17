export const instruments = [
  ['竖琴', 'harp', '#6eabc7'], ['贝斯', 'dbass', '#b49b78'], ['底鼓', 'bdrum', '#c08e73'], ['小军鼓', 'sdrum', '#c99f7c'],
  ['踩镲', 'click', '#bdb17f'], ['吉他', 'guitar', '#7db496'], ['长笛', 'flute', '#78b1b1'], ['钟琴', 'bell', '#b6ad7a'],
  ['冰钟', 'icechime', '#91b6d2'], ['木琴', 'xylobone', '#bea084'], ['铁木琴', 'iron_xylophone', '#9ca9bf'], ['牛铃', 'cow_bell', '#b5a587'],
  ['迪吉里杜管', 'didgeridoo', '#af8c79'], ['方波', 'bit', '#a49ac5'], ['班卓琴', 'banjo', '#b8ae8c'], ['电钢琴', 'pling', '#8aaec4']
] as const
export const pitchName = (midi: number) => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
export const ticksPerBar = (meter: string) => {const [n,d]=meter.split('/').map(Number);return n*16/d}
