import json, subprocess, sys
lang = sys.argv[1]; P = json.load(open(f'plan-{lang}.json'))
T = P['total']
inputs = []
for f in P['files']: inputs += ['-i', f]
fl = []
for i, o in enumerate(P['off']):
    ms = int(o * 1000)
    fl.append(f"[{i}:a]aresample=48000,adelay={ms}|{ms},apad[v{i}]")
fl.append(''.join(f'[v{i}]' for i in range(7)) + f"amix=inputs=7:normalize=0,atrim=0:{T:.3f}[voz]")
fl.append("[voz]alimiter=limit=0.95[out]")
subprocess.run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', ';'.join(fl), '-map', '[out]', '-ac', '2', '-ar', '48000', f'audio-{lang}.wav'], check=True)
print('ok', lang, T)
