"""Build Voxwarden's original geometric mark and platform icons (development only).

Requires Pillow, never imports or transforms upstream artwork. All geometry below
was created for Voxwarden; generated assets are committed for dependency-free builds.
"""
from pathlib import Path
import json, hashlib
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SHIELD = [(256,44),(406,102),(390,300),(256,460),(122,300),(106,102)]
WARD = [(165,160),(207,147),(258,268),(324,126),(360,145),(260,365)]
SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Voxwarden">
<rect width="512" height="512" rx="112" fill="#101a2c"/>
<path d="M256 44 406 102 390 300 256 460 122 300 106 102Z" fill="#172e40" stroke="#5cdbc5" stroke-width="14" stroke-linejoin="round"/>
<path d="M165 160 207 147 258 268 324 126 360 145 260 365Z" fill="#ffc76d"/>
<path d="M65 180Q31 256 65 330M447 180Q481 256 447 330" fill="none" stroke="#5cdbc5" stroke-width="14" stroke-linecap="round"/>
</svg>\n'''

def mark(size, *, tile=False, active=True, mono=False, attention=False):
    scale=4; n=512
    image=Image.new('RGBA',(n*scale,n*scale),(0,0,0,0)); d=ImageDraw.Draw(image)
    xy=lambda pts:[(int(x*scale),int(y*scale)) for x,y in pts]
    box=lambda pts:tuple(int(x*scale) for x in pts)
    if tile: d.rounded_rectangle(box((0,0,512,512)),radius=112*scale,fill='#101a2c')
    edge='#000000' if mono else ('#5cdbc5' if active else '#648491')
    fill='#000000' if mono else '#172e40'
    d.polygon(xy(SHIELD),fill=fill)
    d.line(xy(SHIELD+[SHIELD[0]]),fill=edge,width=14*scale,joint='curve')
    d.polygon(xy(WARD),fill=(0,0,0,0) if mono else ('#ffc76d' if active else '#869baf'))
    for b in [(22,173,90,339),(422,173,490,339)]:
        d.arc(box(b),80 if b[0]<100 else 260,280 if b[0]<100 else 460,fill=edge,width=14*scale)
    if attention:
        d.ellipse(box((358,34,490,166)),fill=(0,0,0,0))
        d.ellipse(box((376,52,472,148)),fill='#000000' if mono else '#ff876e')
    return image.resize((size,size),Image.Resampling.LANCZOS)

def write(image,name,**kwargs):
    file=ROOT/name; file.parent.mkdir(parents=True,exist_ok=True); image.save(file,**kwargs)

def main():
    brand=ROOT/'branding'; brand.mkdir(exist_ok=True)
    (brand/'voxwarden.svg').write_text(SVG,encoding='utf-8')
    master=mark(1024,tile=True)
    write(master,'branding/voxwarden.png')
    write(master,'images/icon.png')
    write(master,'app/desktop/build/icon.png')
    write(master,'app/desktop/build/icon.ico',format='ICO',sizes=[(n,n) for n in [16,20,24,32,40,48,64,128,256]])
    write(master,'app/desktop/build/icon.icns',format='ICNS')
    for base,attention in [('tray',False),('tray-attention',True)]:
        for suffix,size in [('',16),('@1.25x',20),('@1.5x',24),('@2x',32)]:
            write(mark(size,attention=attention),f'app/desktop/assets/{base}{suffix}.png')
    for base,attention in [('trayTemplate',False),('trayAttentionTemplate',True)]:
        for suffix,size in [('',16),('@2x',32)]:
            write(mark(size,mono=True,attention=attention),f'app/desktop/assets/{base}{suffix}.png')
    for state in ['active','inactive']:
        for suffix,size in [('',96),('@2x',192),('-64',64),('-64@2x',128)]:
            write(mark(size,active=state=='active'),f'app/desktop/renderer/img/bones-{state}{suffix}.png')
    for name,size,tile in [('Voxwarden',256,True),('Voxwarden-portrait',256,False),('Voxwarden-portrait-64',64,False),('BonesIcon',64,False)]:
        write(mark(size,tile=tile),f'addon/Voxwarden/Media/{name}.tga',format='TGA',compression=None)
    # A simple original map illustration for the desktop welcome screen.
    map_svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" rx="24" fill="#172e40"/><path d="M30 270 140 210 210 240 340 110 440 150 600 70" fill="none" stroke="#ffc76d" stroke-width="9" stroke-linecap="round" stroke-dasharray="12 12"/>'
    for x,y in [(30,270),(210,240),(440,150),(600,70)]: map_svg+=f'<circle cx="{x}" cy="{y}" r="14" fill="#5cdbc5" stroke="#101a2c" stroke-width="5"/>'
    (ROOT/'app/desktop/renderer/img/route-map.svg').write_text(map_svg+'</svg>\n',encoding='utf-8')
    # Original small control glyphs, drawn as code rather than reusing upstream SVG art.
    paths={
      'check':'M4 12 9 17 20 6','ok':'M4 12 9 17 20 6','copy':'M8 8H20V21H8ZM4 16V3H16',
      'chat':'M3 4H21V17H9L4 21V17H3Z','caret-down':'M5 9 12 16 19 9','chevron':'M9 5 16 12 9 19',
      'back':'M14 5 7 12 14 19M7 12H21','clock':'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M12 7V12L16 15',
      'computer':'M3 4H21V17H3ZM12 17V21M7 21H17','home':'M3 11 12 3 21 11M6 10V21H18V10M10 21V14H14V21',
      'info':'M12 10V18M12 5V6','none':'M4 12H20','pause':'M8 4V20M16 4V20','play':'M7 3 21 12 7 21Z',
      'pin':'M12 22 4 11Q1 1 12 2Q23 1 20 11ZM12 7V11','out':'M14 3H21V10M21 3 10 14M10 4H3V21H20V14',
      'refresh':'M20 8A9 9 0 1 0 20 16M20 3V8H15','route':'M4 20 8 6 16 18 21 4',
      'plug':'M7 2V8M17 2V8M4 8H20V13L14 18V22H10V18L4 13Z','x':'M5 5 19 19M19 5 5 19',
      'bad':'M5 5 19 19M19 5 5 19','bars':'M4 6H20M4 12H20M4 18H20',
      'warn':'M12 2 23 21H1ZM12 8V14M12 17V18','gear':'M12 2V6M12 18V22M2 12H6M18 12H22M5 5 8 8M16 16 19 19M19 5 16 8M8 16 5 19M12 7A5 5 0 1 0 12 17A5 5 0 1 0 12 7',
      'shield':'M12 2 21 6 20 15 12 22 4 15 3 6ZM7 9 11 16 17 7','spark':'M12 1 15 9 23 12 15 15 12 23 9 15 1 12 9 9Z',
    }
    for file in (ROOT/'app/desktop/renderer/icons').glob('*.svg'):
        d=paths.get(file.stem,'M12 2 22 12 12 22 2 12Z')
        stroke='#a8a49b' if file.stem=='caret-down' else 'currentColor'
        file.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="{d}" fill="none" stroke="{stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>\n',encoding='utf-8',newline='\n')
    assets=[p for folder in ['app/desktop/assets','app/desktop/build','app/desktop/renderer/img','app/desktop/renderer/icons','addon/Voxwarden/Media','branding'] for p in (ROOT/folder).glob('*') if p.suffix in ['.png','.tga','.ico','.icns','.svg']]
    hashes={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(assets)}
    (brand/'assets.sha256.json').write_text(json.dumps(hashes,indent=2)+'\n',encoding='utf-8')
    print(f'Generated {len(hashes)} original brand assets.')

if __name__=='__main__': main()
