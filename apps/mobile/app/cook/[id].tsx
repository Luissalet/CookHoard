// Cook mode — a full-screen, step-by-step player: huge text, per-step ingredients (from the
// flow diagram), and cookalong timers that KEEP RUNNING while you move between steps (start
// the oven on step 3, read step 4 while it counts down). Finished timers vibrate/beep; the
// screen stays awake while cooking; "dish done → post your make".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Vibration, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { buildDiagram, formatTimer } from '@cookhoard/core';
import { useStore } from '../../src/store';
import { colors, font, mono, radius, space } from '../../src/theme';
import { ingredientName } from '../../src/format';

type TimerState = { total: number; remaining: number; running: boolean; done: boolean };

// Web-only beep. The AudioContext is created on the first user gesture (start button) so the
// browser doesn't leave it suspended; native relies on Vibration.
let audioCtx: AudioContext | null = null;
function ensureAudio() {
  if (Platform.OS !== 'web' || audioCtx) return;
  try {
    const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
    const C = Ctx.AudioContext ?? Ctx.webkitAudioContext;
    if (C) audioCtx = new C();
  } catch { /* no audio on this browser */ }
}
function notifyTimerDone() {
  try { Vibration.vibrate([400, 250, 400, 250, 700]); } catch { /* web without vibration */ }
  if (Platform.OS === 'web' && audioCtx) {
    try {
      const beep = (at: number) => {
        const o = audioCtx!.createOscillator();
        const g = audioCtx!.createGain();
        o.frequency.value = 880;
        o.connect(g); g.connect(audioCtx!.destination);
        const t0 = audioCtx!.currentTime + at;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        o.start(t0); o.stop(t0 + 0.55);
      };
      beep(0); beep(0.6); beep(1.2);
    } catch { /* ignore */ }
  }
}

export default function CookMode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { recipeById } = useStore();
  const recipe = recipeById(String(id));
  useKeepAwake(); // don't let the screen sleep mid-recipe (hands are covered in flour)

  const [idx, setIdx] = useState(0);
  const steps = recipe?.steps ?? [];
  const step = steps[idx];
  const diagram = useMemo(() => (recipe ? buildDiagram(recipe) : null), [recipe]);
  const stepIngs = diagram?.rows[idx]?.newIngredients ?? [];

  // One shared map, keyed by step index — timers survive step navigation.
  const [timers, setTimers] = useState<Record<number, TimerState>>({});
  const timersRef = useRef(timers);
  timersRef.current = timers;
  const anyRunning = Object.values(timers).some((tm) => tm.running);

  useEffect(() => {
    if (!anyRunning) return;
    const iv = setInterval(() => {
      const prev = timersRef.current;
      const next: Record<number, TimerState> = {};
      let finished = false;
      for (const [k, tm] of Object.entries(prev)) {
        if (!tm.running) { next[+k] = tm; continue; }
        const r = tm.remaining - 1;
        if (r <= 0) { next[+k] = { ...tm, remaining: 0, running: false, done: true }; finished = true; }
        else next[+k] = { ...tm, remaining: r };
      }
      if (finished) notifyTimerDone();
      setTimers(next);
    }, 1000);
    return () => clearInterval(iv);
  }, [anyRunning]);

  if (!recipe || !step) {
    return <SafeAreaView style={s.screen}><Text style={font.muted}>404</Text></SafeAreaView>;
  }

  const last = idx === steps.length - 1;
  const tm = timers[idx];
  const shownRemaining = tm ? tm.remaining : step.timerSec ?? null;

  function toggleTimer() {
    const total = steps[idx]?.timerSec;
    if (!total) return;
    ensureAudio();
    setTimers((p) => {
      const cur = p[idx];
      if (!cur || cur.done) return { ...p, [idx]: { total, remaining: total, running: true, done: false } };
      return { ...p, [idx]: { ...cur, running: !cur.running } };
    });
  }
  function resetTimer() {
    setTimers((p) => {
      const { [idx]: _drop, ...rest } = p;
      return rest;
    });
  }

  const qtyOf = (ingId: string) => {
    const ri = recipe.ingredients.find((i) => i.ingredientId === ingId);
    return ri ? [ri.quantity, ri.unit].filter(Boolean).join(' ') : '';
  };

  const activeEntries = Object.entries(timers)
    .map(([k, tmr]) => ({ step: +k, ...tmr }))
    .sort((a, b) => a.step - b.step);

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      {/* Top bar: exit + progress */}
      <View style={s.top}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.close}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: space(3) }}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${((idx + 1) / steps.length) * 100}%` }]} />
          </View>
          <Text style={[font.tiny, { marginTop: 6, textAlign: 'center' }]}>
            {t('cook.stepOf', { n: idx + 1, total: steps.length })} · {recipe.title}
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: space(5) }}>
        <Text style={s.stepText}>{step.text}</Text>

        {stepIngs.length > 0 && (
          <View style={{ marginTop: space(5) }}>
            <Text style={[font.muted, { marginBottom: 6 }]}>{t('cook.inThisStep')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {stepIngs.map((ingId) => (
                <View key={ingId} style={s.ing}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
                    {qtyOf(ingId) ? `${qtyOf(ingId)} ` : ''}{ingredientName(ingId)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {shownRemaining != null && (
          <View style={{ alignItems: 'center', marginTop: space(6) }}>
            <Text style={[s.timer, tm?.done && { color: colors.ready }]}>
              {tm?.done ? t('cook.timerDone') : formatTimer(shownRemaining)}
            </Text>
            <View style={{ flexDirection: 'row', marginTop: space(2) }}>
              <Pressable style={s.tBtn} onPress={toggleTimer}>
                <Ionicons name={tm?.running ? 'pause' : 'play'} size={18} color={colors.accentInk} />
                <Text style={s.tBtnTxt}>
                  {tm?.running ? t('cook.pause') : tm?.done ? t('cook.restart') : t('cook.startTimer')}
                </Text>
              </Pressable>
              <Pressable style={[s.tBtn, { backgroundColor: colors.surfaceAlt }]} onPress={resetTimer}>
                <Ionicons name="refresh" size={18} color={colors.text} />
                <Text style={[s.tBtnTxt, { color: colors.text }]}>{t('cook.reset')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Cookalong bar: every started timer, still ticking across steps. Tap → jump; done → dismiss. */}
      {activeEntries.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.timerBar} contentContainerStyle={{ paddingHorizontal: space(4), gap: 8 }}>
          {activeEntries.map((e) => (
            <Pressable
              key={e.step}
              onPress={() => (e.done ? setTimers((p) => { const { [e.step]: _x, ...rest } = p; return rest; }) : setIdx(e.step))}
              style={[s.timerChip, e.done && { backgroundColor: colors.ready, borderColor: colors.ready }, !e.running && !e.done && { opacity: 0.6 }]}
            >
              <Ionicons name={e.done ? 'checkmark' : e.running ? 'timer-outline' : 'pause'} size={14} color={e.done ? colors.accentInk : colors.text} />
              <Text style={[s.timerChipTxt, e.done && { color: colors.accentInk }]}>
                {t('cook.timerChip', { n: e.step + 1 })} · {e.done ? t('cook.timerDone') : formatTimer(e.remaining)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Bottom nav */}
      <View style={s.bottom}>
        <Pressable
          style={[s.nav, { backgroundColor: colors.surfaceAlt, opacity: idx === 0 ? 0.4 : 1 }]}
          disabled={idx === 0}
          onPress={() => setIdx((i) => Math.max(0, i - 1))}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
          <Text style={{ color: colors.text, fontWeight: '800' }}>{t('cook.prev')}</Text>
        </Pressable>
        <Pressable
          style={[s.nav, { backgroundColor: last ? colors.ready : colors.accent, flex: 1.4 }]}
          onPress={() => (last ? router.replace(`/make/${recipe.id}`) : setIdx((i) => i + 1))}
        >
          <Text style={{ color: colors.accentInk, fontWeight: '800' }} numberOfLines={1}>
            {last ? t('cook.finish') : t('cook.next')}
          </Text>
          {!last && <Ionicons name="chevron-forward" size={20} color={colors.accentInk} />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), paddingTop: space(2) },
  close: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 4, backgroundColor: colors.surfaceAlt },
  progressFill: { height: 4, backgroundColor: colors.accent },
  stepText: { fontSize: 26, lineHeight: 36, fontWeight: '700', color: colors.text },
  ing: { borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 8 },
  timer: { fontSize: 60, fontWeight: '700', color: colors.text, fontFamily: mono, fontVariant: ['tabular-nums'] },
  tBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 18, paddingVertical: 10, marginHorizontal: 6 },
  tBtnTxt: { color: colors.accentInk, fontWeight: '700', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginLeft: 6 },
  timerBar: { maxHeight: 44, marginBottom: space(1) },
  timerChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 8, gap: 5 },
  timerChipTxt: { color: colors.text, fontWeight: '600', fontSize: 12, fontFamily: mono, fontVariant: ['tabular-nums'] },
  bottom: { flexDirection: 'row', padding: space(4), gap: space(2) },
  nav: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: radius.md, gap: 4 },
});
