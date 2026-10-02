# Makes a fictional demo collection for the website's captures: synthesized
# loops at a set BPM and key, tagged, in a few folders and formats.
# Usage: python3 make-demo-collection.py <folder>  (see README.md here)
import subprocess, os, random, sys
random.seed(7)
ROOT = sys.argv[1]
NOTES = {'C':65.41,'C#':69.30,'D':73.42,'Eb':77.78,'E':82.41,'F':87.31,'F#':92.50,'G':98.00,'Ab':103.83,'A':110.0,'Bb':116.54,'B':123.47}
# folder, genre, bpm range, formats
GROUPS = [
 ('Bandcamp/Dub & Steppers', 'Dub', (138,142), ['aiff','aiff','wav']),
 ('Bandcamp/Jungle', 'Jungle', (168,172), ['aiff','flac','aiff']),
 ('Promos/140', 'Dubstep', (139,141), ['wav','mp3','aiff']),
 ('Vinyl Rips/UK Garage', 'UK Garage', (130,134), ['aiff','mp3']),
 ('House & Techno', 'House', (122,126), ['mp3','aiff','wav']),
]
ARTISTS = ['Low Tide Sound','Mira Kesh','Iron Lion Hi-Fi','Selector Opal','Northside Echo','Cassia Dub',
 'Rootical Unit','Hollow Frame','Kai Varden','The Sub Collective','Amber Riddim','Delta Ward',
 'Night Bus Crew','Juno Mace','Sola Ray','Tempest Roots','Grey Harbour','Fennel & Stone']
WORDS = ['Pressure','Midnight','Foundation','Echo Chamber','Stepping Out','Harbour Lights','Rise Up','Deep Water',
 'Signal','Lantern','Basement','Northern Line','Riverside','Solid Ground','Night Market','Static','Gold Dust',
 'Satellite','Low Light','Heavy Weather','Firefly','Second Wind','Long Way Home','Crosstown','Afterglow',
 'Undertow','Cold Fire','Paper Moon','Iron Gate','Slow Burn','Open Road','Blue Hour','Dreamer','Outernational',
 'Bassline Science','Wobble Theory','Quiet Storm','Sunday Version','Dub Plate','Skyline']
random.shuffle(WORDS)
n = 0
for folder, genre, (lo, hi), formats in GROUPS:
    os.makedirs(os.path.join(ROOT, folder), exist_ok=True)
    for i in range(8):
        artist = random.choice(ARTISTS)
        title = WORDS[n % len(WORDS)] + (random.choice(['', '', ' (Dub)', ' VIP', ' (Version)']) if genre != 'House' else random.choice(['', ' (Extended Mix)', '']))
        n += 1
        bpm = random.randint(lo, hi)
        key = random.choice(list(NOTES))
        minor = random.random() < 0.8
        root = NOTES[key]
        third = 1.189 if minor else 1.26
        fmt = random.choice(formats)
        dur = 48
        b = 60.0 / bpm
        # kick (silent in the first 4 bars), offbeat hats, a bass that follows the bar, a soft triad pad
        intro = 4 * 4 * b
        expr = (
          f"0.55*gte(t,{intro:.4f})*sin(2*PI*(45+110*exp(-mod(t,{b:.5f})*28))*mod(t,{b:.5f}))*exp(-mod(t,{b:.5f})*7)"
          f"+0.10*(random(0)*2-1)*exp(-mod(t+{b/2:.5f},{b:.5f})*45)"
          f"+0.28*sin(2*PI*{root:.3f}*(1+0.498*gte(mod(t,{8*b:.5f}),{6*b:.5f}))*t)*(0.6+0.4*cos(2*PI*t/{b:.5f}))"
          f"+0.07*(sin(2*PI*{root*4:.3f}*t)+sin(2*PI*{root*4*third:.3f}*t)+sin(2*PI*{root*4*1.498:.3f}*t))*(0.5+0.5*sin(2*PI*t/{16*b:.5f}))"
        )
        name = f"{artist} - {title}.{fmt}"
        path = os.path.join(ROOT, folder, name)
        meta = ['-metadata', f'title={title}', '-metadata', f'artist={artist}', '-metadata', f'album={random.choice(["Version Excursions","Night Sessions","Foundation Vol. 2","Outer Signals EP","Basement Tapes"])}',
                '-metadata', f'date={random.randint(2016,2026)}']
        if random.random() < 0.6: meta += ['-metadata', f'genre={genre}']
        codec = {'aiff':['-c:a','pcm_s16be','-write_id3v2','1'],'wav':['-c:a','pcm_s16le'],'flac':['-c:a','flac'],'mp3':['-c:a','libmp3lame','-b:a','320k','-id3v2_version','3']}[fmt]
        subprocess.run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i',f"aevalsrc='{expr}':s=44100:d={dur}",
                        '-af','afade=t=in:d=2,afade=t=out:st=44:d=4,alimiter=limit=0.9','-ac','2',*meta,*codec,path], check=True)
        print(fmt, bpm, key + ('m' if minor else ''), name)
