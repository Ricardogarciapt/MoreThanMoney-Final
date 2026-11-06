import json, subprocess, sys
lang = sys.argv[1]; P = json.load(open(f'plan-{lang}.json'))
T = P['total']
inputs = ['-stream_loop', '-1', '-i', 'musica.wav']
for f in P['files']: inputs += ['-i', f]
fl = [f"[0:a]atrim=0:{T:.3f},volume=0.14,afade=t=in:d=0.8,afade=t=out:st={T-2:.3f}:d=2[m]"]
for i, o in enumerate(P['off']):
    ms = int(o * 1000)
    fl.append(f"[{i+1}:a]aresample=48000,adelay={ms}|{ms},apad[v{i}]")
fl.append(''.join(f'[v{i}]' for i in range(7)) + f"amix=inputs=7:normalize=0,atrim=0:{T:.3f}[voz]")
fl.append(f"[m]aresample=48000[m2];[m2][voz]amix=inputs=2:normalize=0,alimiter=limit=0.95[out]")
subprocess.run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', ';'.join(fl), '-map', '[out]', '-ac', '2', '-ar', '48000', f'audio-{lang}.wav'], check=True)
print('ok', lang, T)
