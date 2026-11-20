# Procedural soundtrack + sound design for NEON BAY (48 s). Writes audio/soundtrack.wav
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, os

SR = 44100
DUR = 48.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
T = np.arange(N) / SR

def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def env(n, a, d, s, r, sl=None):
    sl = int(sl * SR) if sl is not None else n
    e = np.zeros(n); A = int(a * SR); D = int(d * SR); Rl = int(r * SR)
    hold = max(0, min(n, sl) - A - D)
    seg = np.concatenate([np.linspace(0, 1, A, False), np.linspace(1, s, D, False), np.full(hold, s)])
    seg = seg[:n]; e[:len(seg)] = seg
    rel_start = len(seg)
    if rel_start < n:
        k = min(Rl, n - rel_start); e[rel_start:rel_start + k] = np.linspace(s, 0, k)
    return e
def add(buf, x, t0, gain=1.0):
    i = int(t0 * SR)
    if i >= len(buf): return
    if i < 0: x = x[-i:]; i = 0
    k = min(len(x), len(buf) - i)
    buf[i:i + k] += x[:k] * gain
def saw(f, n, ph=0):
    t = np.arange(n) / SR; return 2 * ((f * t + ph) % 1) - 1
def sq(f, n, duty=.5):
    t = np.arange(n) / SR; return np.where((f * t) % 1 < duty, 1.0, -1.0)
def note(m): return 440 * 2 ** ((m - 69) / 12)

music = np.zeros((N, 2)); sfx = np.zeros((N, 2))
BPM = 110; B = 60 / BPM; BAR = 4 * B
# chord progression (A minor synthwave): Am F C G
CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOT = [45, 41, 48, 43]

def section_gain(t):
    # music arrangement + comic cut at the splash
    g = np.ones_like(t)
    g *= np.clip(t / 1.5, 0, 1)
    cut = (t > 27.66) & (t < 31.9)
    g[cut] = 0.0
    g *= np.where(t > 47.0, np.clip((48 - t) / 1.0, 0, 1), 1)
    return g

def mono_to_st(x, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l, x * r], 1)

# ---- pads (detuned saws, lowpassed), whole piece
pad = np.zeros(N)
nbars = int(DUR / BAR) + 1
for b in range(nbars):
    t0 = b * BAR; c = CH[b % 4]; n = int(BAR * SR * 1.05)
    x = np.zeros(n)
    for m in c + [c[0] + 12]:
        for det in (-0.12, 0.0, 0.11):
            x += saw(note(m) * 2 ** (det / 12), n, rng.random())
    x *= env(n, .25, .4, .8, .3, BAR)
    add(pad, x * .05, t0)
cut = 900 + 1800 * np.clip((T - 0) / 8, 0, 1)
pad = lp(pad, 2200)
pad *= np.where(T < 32, 1.0, 1.25)
music += mono_to_st(pad, -.2) * .55 + mono_to_st(np.roll(pad, 600), .3) * .45

# ---- arpeggio (16ths), starts at 2s, plucky square
arp = np.zeros(N)
step = B / 4
for i in range(int(DUR / step)):
    t0 = i * step
    if t0 < 2.0: continue
    b = int(t0 / BAR) % 4; c = CH[b]
    seq = [c[0] + 12, c[1] + 12, c[2] + 12, c[1] + 24, c[2] + 12, c[0] + 24, c[1] + 12, c[2] + 12]
    m = seq[i % 8]
    n = int(step * SR * 1.6)
    x = sq(note(m), n, .3) * np.exp(-np.arange(n) / SR * 14)
    add(arp, x * .09, t0)
arp = lp(arp, 3800)
# ping-pong echo
echo = np.zeros(N); d = int(B * .75 * SR); echo[d:] = arp[:-d] * .45
music += np.stack([arp + echo * .3, arp * .8 + echo * .6], 1) * .9

# ---- bass (8th note octaves), from 4s
bass = np.zeros(N)
for i in range(int(DUR / (B / 2))):
    t0 = i * B / 2
    if t0 < 4.0: continue
    b = int(t0 / BAR) % 4; m = ROOT[b] - 12 + (12 if i % 2 else 0)
    n = int(B / 2 * SR * .95)
    x = (saw(note(m), n) * .6 + sq(note(m) * .5, n) * .4) * env(n, .005, .12, .55, .05)
    add(bass, x * .25, t0)
bass = lp(bass, 700, 4)
music += mono_to_st(bass) * 1.0

# ---- drums from 4s: kick 4-on-floor, snare 2&4 w/ big gated reverb, hats 8ths
kick = np.zeros(N); snare = np.zeros(N); hats = np.zeros(N)
kn = int(.4 * SR); kt = np.arange(kn) / SR
kick1 = np.sin(2 * np.pi * (45 * kt + 120 * (1 - np.exp(-kt * 30)) / 30)) * np.exp(-kt * 7) * 1.0
sn = int(.35 * SR); st = np.arange(sn) / SR
snare1 = (rng.standard_normal(sn) * .7 * np.exp(-st * 14) + np.sin(2 * np.pi * 190 * st) * np.exp(-st * 20) * .6)
snare1 = bp(snare1, 180, 7000)
ir = rng.standard_normal(int(.35 * SR)) * np.exp(-np.arange(int(.35 * SR)) / SR * 6); ir[int(.28 * SR):] *= .15
snare1 = snare1 + fftconvolve(snare1, ir)[:sn] * .08
hn = int(.06 * SR); hat1 = hp(rng.standard_normal(hn), 7000) * np.exp(-np.arange(hn) / SR * 70)
for i in range(int(DUR / B)):
    t0 = i * B
    if t0 >= 4.0:
        add(kick, kick1, t0)
        if i % 4 in (1, 3): add(snare, snare1, t0)
    if t0 >= 8.0:
        add(hats, hat1, t0 + B / 2, .5); add(hats, hat1, t0, .25)
# snare fill into 8 and into 40
for k in range(8):
    add(snare, snare1, 8 - B * 2 + k * B / 4, .25 + k * .07)
    add(snare, snare1, 40 - B * 2 + k * B / 4, .25 + k * .07)
music += mono_to_st(kick) * .85 + mono_to_st(snare, .05) * .55 + np.stack([hats * .6, hats], 1) * .5

# ---- lead melody (from 16s; night variation from 32; finale at 40)
lead = np.zeros(N)
mel = [(0, 69, 1.5), (1.5, 72, .5), (2, 76, 1), (3, 74, 1), (4, 72, 1.5), (5.5, 69, .5), (6, 72, 1), (7, 67, 1),
       (8, 64, 1.5), (9.5, 67, .5), (10, 72, 1), (11, 71, 1), (12, 67, 2), (14, 74, 2)]
def play_mel(t_start, bars_len, trans=0, gain=.12):
    for (bt, m, dur) in mel:
        t0 = t_start + bt * B
        if t0 > t_start + bars_len * BAR: break
        n = int(dur * B * SR)
        f = note(m + trans); tt = np.arange(n) / SR
        vib = 1 + .004 * np.sin(2 * np.pi * 5.5 * tt) * np.clip(tt * 3, 0, 1)
        ph = np.cumsum(f * vib) / SR
        x = (2 * (ph % 1) - 1) * .5 + (2 * ((ph * 1.005) % 1) - 1) * .5
        x *= env(n, .01, .2, .7, .08)
        add(lead, x * gain, t0)
play_mel(16.0, 4); play_mel(32 + B * 0, 4, 0, .1); play_mel(40.0, 4, 12, .09); play_mel(40.0, 4, 0, .07)
lead = lp(lead, 3000)
le = np.zeros(N); d2 = int(B * .5 * SR); le[d2:] = lead[:-d2] * .35
music += np.stack([lead + le * .5, lead * .9 + le], 1) * .9

# ---- risers / impacts
def riser(t0, dur, g=.25):
    n = int(dur * SR); x = rng.standard_normal(n); tt = np.arange(n) / SR
    out = np.zeros(n); blocks = 40
    for k in range(blocks):
        a = int(k * n / blocks); b = int((k + 1) * n / blocks); fc = 300 + (6000 * (k / blocks) ** 2)
        out[a:b] = bp(x, fc * .7, min(fc * 1.4, 20000))[a:b]
    out *= (tt / dur) ** 2
    add(sfx[:, 0], out * g, t0); add(sfx[:, 1], out * g, t0)
def impact(t0, g=.6):
    n = int(1.6 * SR); tt = np.arange(n) / SR
    x = np.sin(2 * np.pi * (40 * tt + 60 * (1 - np.exp(-tt * 8)) / 8)) * np.exp(-tt * 3) + lp(rng.standard_normal(n), 1200) * np.exp(-tt * 5) * .6
    add(sfx[:, 0], x * g, t0); add(sfx[:, 1], x * g, t0)
riser(5.8, 2.0); impact(8.0, .5); riser(14.6, 1.3, .2)
riser(38.2, 1.8, .18); impact(40.0, .45); impact(42.65, .55)

# ---- whooshes for transitions
def whoosh(t0, dur=.9, g=.5, pan_from=-1, pan_to=1):
    n = int(dur * SR); tt = np.arange(n) / SR
    x = rng.standard_normal(n); e = np.sin(np.pi * tt / dur) ** 2
    y = np.zeros(n)
    for k in range(20):
        a = int(k * n / 20); b = int((k + 1) * n / 20); fc = 400 + 2600 * np.sin(np.pi * (k / 20))
        y[a:b] = bp(x, fc * .6, fc * 1.6)[a:b]
    y *= e
    pan = np.linspace(pan_from, pan_to, n)
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    add(sfx[:, 0], y * l * g, t0); add(sfx[:, 1], y * r * g, t0)
whoosh(7.55, 1.0, .55); whoosh(15.7, .7, .6, 1, -1); whoosh(32.2, 1.6, .25, -1, 1); whoosh(40.2, 2.2, .3, 1, -1); whoosh(2.0, 1.4, .18)

# ---- ambience beds
def bed(t0, t1, kind, g):
    n = int((t1 - t0) * SR); tt = np.arange(n) / SR
    x = rng.standard_normal(n)
    if kind == 'city':
        y = lp(x, 900) * .9 + bp(x, 1500, 4000) * .08
        e = np.clip(tt / .4, 0, 1) * np.clip((t1 - t0 - tt) / .4, 0, 1)
    elif kind == 'waves':
        y = lp(x, 1400) * (.55 + .45 * np.sin(2 * np.pi * tt / 3.7) ** 2) + hp(x, 3000) * .05 * np.sin(2 * np.pi * tt / 3.7) ** 4
        e = np.clip(tt / .5, 0, 1) * np.clip((t1 - t0 - tt) / .8, 0, 1)
    else:  # night: muffled club thump
        thump = np.zeros(n)
        for i in range(int((t1 - t0) / (60 / 124))):
            add(thump, kick1[:int(.25 * SR)] * .7, i * 60 / 124)
        y = lp(thump, 180) + lp(x, 600) * .35
        e = np.clip(tt / 1.0, 0, 1) * np.clip((t1 - t0 - tt) / 1.0, 0, 1)
    y *= e
    st = np.stack([y, np.roll(y, 2000)], 1)
    sfx[int(t0 * SR):int(t0 * SR) + n] += st * g
bed(8, 16.2, 'city', .2); bed(16, 33.5, 'waves', .16); bed(33.5, 47.5, 'night', .22)
# chatter-ish murmur in the street
mur = np.zeros(int(8 * SR))
for i in range(60):
    t0 = rng.random() * 7.5; n = int((.2 + rng.random() * .5) * SR); f = 110 + rng.random() * 180
    tt = np.arange(n) / SR; x = sq(f * (1 + .05 * np.sin(2 * np.pi * 6 * tt)), n) * np.sin(np.pi * tt / tt[-1]) ** 2
    add(mur, bp(x, 300, 2200) * .03, t0)
add(sfx[:, 0], mur, 8.1); add(sfx[:, 1], np.roll(mur, 3000), 8.1)

# ---- tire screeches + honks (scene 2)
def screech(t0, dur=.9, g=.22, pan=0):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = 2300 + 250 * np.sin(2 * np.pi * 23 * tt) + rng.standard_normal(n).cumsum() * .3
    ph = np.cumsum(f) / SR; x = np.sin(2 * np.pi * ph) * .6 + bp(rng.standard_normal(n), 1800, 3500) * .5
    x *= env(n, .02, .1, .8, .3, dur * .7)
    add(sfx[:, 0], x * g * (1 - pan) / 2 * 2, t0); add(sfx[:, 1], x * g * (1 + pan) / 2 * 2, t0)
def honk(t0, dur=.45, g=.35, f=(392, 494), times=2, gap=.12, pan=0):
    for k in range(times):
        n = int(dur * SR); tt = np.arange(n) / SR
        x = sum(sq(fr, n, .45) for fr in f) * .5
        x = bp(x, 300, 3000, 2) * env(n, .01, .05, .9, .05)
        add(sfx[:, 0], x * g * (1 - pan * .6), t0 + k * (dur + gap)); add(sfx[:, 1], x * g * (1 + pan * .6), t0 + k * (dur + gap))
screech(10.55, 1.0, .2, -.3); honk(11.6, .3, .32, times=2, pan=-.3)
screech(12.05, .9, .18, .4); honk(13.15, .85, .36, f=(330, 415), times=1, pan=.3)
# motorbike pass
n = int(2.5 * SR); tt = np.arange(n) / SR; fr = 85 * (1 + .25 * np.tanh((tt - 1.0) * -3)); ph = np.cumsum(fr) / SR
mb = np.tanh(3 * (2 * (ph % 1) - 1)) * np.exp(-((tt - 1.0) / .6) ** 2) * .25; mb = lp(mb, 2500)
add(sfx[:, 0], mb * np.linspace(1.2, .3, n), 8.6); add(sfx[:, 1], mb * np.linspace(.3, 1.2, n), 8.6)

# ---- hero sports car (scene 3): engine roar with gear shifts, pass-bys
n = int(9.5 * SR); tt = np.arange(n) / SR
rpm = 3200 + 2600 * ((tt * .9) % 1.6) / 1.6
rpm = np.where(tt > 6.4, 3200 - (tt - 6.4) * 700, rpm)
rpm = np.clip(rpm, 900, 7000)
f0 = rpm / 60 * 2
ph = np.cumsum(f0) / SR
eng = np.tanh(2.5 * (np.sin(2 * np.pi * ph) + .5 * np.sin(4 * np.pi * ph + .3) + .3 * (2 * ((ph * 1.5) % 1) - 1)))
eng = lp(eng, 1800) + bp(rng.standard_normal(n), 200, 900) * .15
eg = np.clip(tt / .3, 0, 1) * (0.55 + .45 * np.exp(-((tt - 1.4) / .9) ** 2) + .35 * np.exp(-((tt - 5.0) / .8) ** 2))
eg *= np.where(tt > 8.6, np.clip((9.5 - tt) / .9, 0, 1), 1)
eng *= eg * .32
add(sfx[:, 0], eng, 15.95); add(sfx[:, 1], np.roll(eng, 200), 15.95)
screech(23.6, .7, .06, .2)

# ---- scene 4: shutter clicks, bell, splash, record scratch, sad trombone, drips
def click(t0, g=.5):
    n = int(.12 * SR); tt = np.arange(n) / SR
    x = hp(rng.standard_normal(n), 2000) * (np.exp(-tt * 120) + .6 * np.exp(-np.maximum(tt - .05, 0) * 140) * (tt > .05))
    add(sfx[:, 0], x * g, t0); add(sfx[:, 1], x * g, t0)
click(26.42); click(27.15)
def bell(t0, g=.25):
    for k in range(2):
        n = int(.9 * SR); tt = np.arange(n) / SR
        x = (np.sin(2 * np.pi * 2350 * tt) + .6 * np.sin(2 * np.pi * 3170 * tt) + .3 * np.sin(2 * np.pi * 4890 * tt)) * np.exp(-tt * 5)
        add(sfx[:, 0], x * g * .7, t0 + k * .22); add(sfx[:, 1], x * g, t0 + k * .22)
bell(26.95)
# bike whirr
n = int(1.6 * SR); tt = np.arange(n) / SR; wh = bp(rng.standard_normal(n), 2500, 6000) * np.exp(-((tt - .8) / .35) ** 2) * .12
add(sfx[:, 0], wh, 26.9); add(sfx[:, 1], wh, 26.9)
def splash(t0, g=.9):
    n = int(1.3 * SR); tt = np.arange(n) / SR
    x = bp(rng.standard_normal(n), 300, 6000) * (np.exp(-tt * 6) * .9 + .2 * np.exp(-tt * 2))
    for k in range(40):  # bubbly blips
        bt = rng.random() * .8; bn = int(.06 * SR); f = 600 + rng.random() * 1600
        b = np.sin(2 * np.pi * np.cumsum(np.linspace(f, f * 1.8, bn)) / SR) * np.exp(-np.arange(bn) / SR * 50)
        add(x, b * .25, bt)
    lowthump = np.sin(2 * np.pi * 70 * tt) * np.exp(-tt * 10) * .6
    x = x + lowthump
    add(sfx[:, 0], x * g, t0); add(sfx[:, 1], np.roll(x, 300) * g, t0)
splash(27.62)
# record scratch (music stops)
n = int(.45 * SR); tt = np.arange(n) / SR
sc_f = 300 + 1400 * np.abs(np.sin(2 * np.pi * 3.2 * tt)); ph = np.cumsum(sc_f) / SR
scr = (bp(rng.standard_normal(n), 500, 4000) * .6 + np.sin(2 * np.pi * ph) * .3) * np.exp(-tt * 3)
add(sfx[:, 0], scr * .35, 27.66); add(sfx[:, 1], scr * .35, 27.66)
# sad trombone: "wah wah wah waaah"
def tromb(t0, m, dur, bend=0, g=.28):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = note(m) * 2 ** ((bend * np.clip(tt / dur, 0, 1)) / 12) * (1 + .012 * np.sin(2 * np.pi * 5 * tt) * (tt > .3))
    ph = np.cumsum(f) / SR
    x = sum(np.sin(2 * np.pi * k * ph) / k ** .9 for k in range(1, 10))
    wah = .5 + .5 * np.sin(np.pi * np.clip(tt / dur, 0, 1))
    x = lp(x, 1800) * env(n, .04, .1, .85, .15) * wah
    add(sfx[:, 0], x * g, t0); add(sfx[:, 1], x * g, t0)
tromb(29.62, 58, .42); tromb(30.08, 57, .42); tromb(30.54, 56, .42); tromb(31.0, 55, 1.1, -1.2)
# drips
for i in range(16):
    t0 = 28.3 + i * .21 + rng.random() * .08; n = int(.08 * SR); f = 900 + rng.random() * 900
    d = np.sin(2 * np.pi * np.cumsum(np.linspace(f, f * 2.2, n)) / SR) * np.exp(-np.arange(n) / SR * 60) * .1
    add(sfx[:, 0], d, t0); add(sfx[:, 1], d, t0)
# neon buzz / flicker crackles at night onset
for i in range(26):
    t0 = 33.2 + rng.random() * 4.3; n = int(.12 * SR); tt = np.arange(n) / SR
    x = (np.sign(np.sin(2 * np.pi * 120 * tt)) * .3 + hp(rng.standard_normal(n), 3000) * .4) * np.exp(-tt * 25)
    add(sfx[:, 0], x * .05 * rng.random(), t0); add(sfx[:, 1], x * .05 * rng.random(), t0)

# ---- mix
g = section_gain(T)[:, None]
# night section: filter-swept music 32-36 opening up
lowpassed = np.stack([lp(music[:, 0], 900), lp(music[:, 1], 900)], 1)
k = np.clip((T - 32) / 4.5, 0, 1)[:, None]; k = np.where(T[:, None] < 32, 1, k)
music = music * k + lowpassed * (1 - k)
# duck music under the honks/splash
duck = np.ones(N)
for a, b in [(11.5, 12.4), (13.1, 14.1)]: duck[int(a * SR):int(b * SR)] = .65
duck = lp(duck, 8)
mix = music * g * duck[:, None] * .8 + sfx
mix = hp(mix.T, 25).T
peak = np.max(np.abs(mix)); mix = np.tanh(mix / peak * 1.4) / np.tanh(1.4) * .92
os.makedirs('audio', exist_ok=True)
with wave.open('audio/soundtrack.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('ok', mix.shape, peak)
