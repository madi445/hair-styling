"""Prepare a private browser-compatible lesson. Never publishes the source video."""
from pathlib import Path
import argparse,subprocess,sys,shutil,uuid
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);args=parser.parse_args()
source=args.source.resolve()
if not source.is_file():raise SystemExit('Source video not found')
output=root/'videos'/'lesson-1.mp4'
if output.exists():raise SystemExit('lesson-1.mp4 already exists. Archive it before preparing a replacement.')
output.parent.mkdir(exist_ok=True)
binaries=list((root/'.local-video-tools'/'imageio_ffmpeg'/'binaries').glob('ffmpeg*.exe'))
exe=str(binaries[0]) if binaries else shutil.which('ffmpeg')
if not exe:raise SystemExit('FFmpeg unavailable')
partial=output.with_name('lesson-1.encoding-'+uuid.uuid4().hex+'.mp4')
# The supplied source is iPhone HEVC 10-bit HLG HDR. Convert to BT.709 SDR.
filters='zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p'
command=[exe,'-nostdin','-hide_banner','-loglevel','warning','-stats_period','15','-progress','pipe:1','-n','-i',str(source),'-map','0:v:0','-map','0:a:0?','-vf',filters,'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','aac','-b:a','160k','-movflags','+faststart','-map_metadata','-1',str(partial)]
print('Converting complete private lesson...',flush=True)
result=subprocess.run(command)
if result.returncode:raise SystemExit(f'Conversion failed ({result.returncode}); partial file: {partial.name}')
partial.rename(output)
print('READY:',output,'bytes:',output.stat().st_size,flush=True)
