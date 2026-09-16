/**
 * AppsOnAir Push — example / architecture test harness.
 *
 * The point of this screen is that nothing on it is architecture-aware. The same
 * calls run against a Codegen TurboModule or the legacy Bridge depending only on
 * how the app was built; the banner at the top reports which one actually loaded,
 * so a run on each build is a real comparison rather than an assumption.
 *
 * Switching architecture:
 *   Android   npm run android:new   /  npm run android:old
 *   iOS       npm run ios:new       /  npm run ios:old
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import AppPushService from 'appsonair-react-native-apppush';

// ---------------------------------------------------------------------------
// Architecture detection
//
// These globals are installed by the runtime, not by this library:
//   __turboModuleProxy    -- the TurboModule registry; absent on the Bridge.
//   RN$Bridgeless         -- true when the app runs without the legacy bridge.
//   nativeFabricUIManager -- Fabric renderer (irrelevant to a native module,
//                            shown because "New Architecture" usually means both).
// ---------------------------------------------------------------------------

const g = globalThis as Record<string, unknown>;
const hasTurboModules = g.__turboModuleProxy != null;
const isBridgeless = g.RN$Bridgeless === true;
const hasFabric = g.nativeFabricUIManager != null;

type LogEntry = { id: number; kind: 'call' | 'ok' | 'err' | 'event'; text: string };

export default function App() {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? dark : light;

  const [log, setLog] = useState<LogEntry[]>([]);
  const [initialized, setInitialized] = useState(false);
  const nextId = useRef(0);

  const append = useCallback((kind: LogEntry['kind'], text: string) => {
    setLog((prev) => [{ id: nextId.current++, kind, text }, ...prev].slice(0, 60));
  }, []);

  /** Runs one API call and records whatever comes back, including rejections. */
  const run = useCallback(
    (label: string, fn: () => Promise<unknown>) => async () => {
      append('call', label);
      try {
        const result = await fn();
        append('ok', `${label} → ${format(result)}`);
      } catch (error) {
        const e = error as { code?: string; message?: string };
        append('err', `${label} ✗ ${e.code ? `[${e.code}] ` : ''}${e.message ?? String(error)}`);
      }
    },
    [append]
  );

  // Subscribe once to every event the wrapper exposes. The native bridges also
  // emit onTokenUpdated / onSilentNotification / onInstallationIdUpdated /
  // onError, but those have no JS subscriber any more, so they never arrive.
  useEffect(() => {
    initialize()
    const subs = [
      AppPushService.onNotificationReceived((e) =>
        append('event', `onNotificationReceived "${e.notification.title ?? ''}"`)
      ),
      AppPushService.onNotificationOpened((e) =>
        append('event', `onNotificationOpened action=${e.actionId ?? 'body'} url=${e.url ?? 'none'}`)
      ),
      AppPushService.onNotificationWillDisplay((e) => {
        // preventDefault() is honoured on Android only — iOS decides presentation
        // synchronously and cannot wait for this handler. Left un-called so the
        // notification displays; flip it to verify suppression on Android.
        append('event', `onNotificationWillDisplay "${e.notification.title ?? ''}"`);
      }),
      AppPushService.onPermissionChanged((e) => append('event', `onPermissionChanged ${e.granted}`)),
      AppPushService.onSubscriptionChanged((e) =>
        append('event', `onSubscriptionChanged optedIn=${e.current.optedIn}`)
      ),
      AppPushService.onUserStateChanged((e) =>
        append('event', `onUserStateChanged externalId=${e.current.externalId ?? 'null'}`)
      ),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [append]);

  const initialize = useCallback(async () => {
    append('call', 'initialize');
    try {
      await AppPushService.initialize({ debug: true });
      setInitialized(AppPushService.isInitialized());
      append('ok', 'initialize → ready');
    } catch (error) {
      append('err', `initialize ✗ ${(error as Error).message}`);
    }
  }, [append]);

  return (
    <SafeAreaView style={[styles.flex, theme.screen]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Banner theme={theme} initialized={initialized} />

        <Section title="Lifecycle" theme={theme}>
          <Btn label="initialize" onPress={initialize} theme={theme} primary />
          <Btn
            label="guard check (before init)"
            onPress={run('getDeviceId', () => AppPushService.getDeviceId())}
            theme={theme}
          />
        </Section>

        <Section title="Identity" theme={theme}>
          <Btn label="getDeviceId" onPress={run('getDeviceId', async () => await AppPushService.getDeviceId())} theme={theme} />
          <Btn label="getSubscriptionId" onPress={run('getSubscriptionId', async () => await AppPushService.getSubscriptionId())} theme={theme} />
          <Btn label="getExternalId" onPress={run('getExternalId', async () => await AppPushService.getExternalId())} theme={theme} />
          <Btn label="login('user-42')" onPress={run('login', async () => await AppPushService.login('user-42'))} theme={theme} />
          <Btn label="logout" onPress={run('logout', async () => await AppPushService.logout())} theme={theme} />
          <Btn
            label="login('') → should reject"
            onPress={run('login(empty)', async () => await AppPushService.login(''))}
            theme={theme}
          />
        </Section>

        <Section title="Token" theme={theme}>
          <Btn label="getToken" onPress={run('getToken', async () => await AppPushService.getToken())} theme={theme} />
          <Btn label="getDeviceToken" onPress={run('getDeviceToken', async () => await AppPushService.getDeviceToken())} theme={theme} />
        </Section>

        <Section title="Permissions" theme={theme}>
          <Btn label="requestPermission" onPress={run('requestPermission', async () => await AppPushService.requestPermission())} theme={theme} primary />
          <Btn label="getPermission" onPress={run('getPermission', async () => await AppPushService.getPermission())} theme={theme} />
          <Btn label="getPermissionStatus" onPress={run('getPermissionStatus', async () => await AppPushService.getPermissionStatus())} theme={theme} />
          <Btn label="canRequestPermission" onPress={run('canRequestPermission', async () => await AppPushService.canRequestPermission())} theme={theme} />
          <Btn
            label="provisional auth (iOS)"
            onPress={run('registerForProvisionalAuthorization', async () =>
              await AppPushService.registerForProvisionalAuthorization()
            )}
            theme={theme}
          />
        </Section>

        <Section title="Notifications" theme={theme}>
          <Btn label="clearAll" onPress={run('notifications.clearAll', async () => await AppPushService.notifications.clearAll())} theme={theme} />
          <Btn
            label="remove('demo-1')"
            onPress={run('notifications.remove', async () => await AppPushService.notifications.remove('demo-1'))}
            theme={theme}
          />
          <Btn
            label="removeMany"
            onPress={run('notifications.removeMany', async () => await AppPushService.notifications.removeMany(['demo-1', 'demo-2']))}
            theme={theme}
          />
          <Btn
            label="removeGroup (Android)"
            onPress={run('notifications.removeGroup', async () => await AppPushService.notifications.removeGroup('demo-group'))}
            theme={theme}
          />
        </Section>

        <Section title="Badge" theme={theme}>
          <Btn label="get" onPress={run('badge.get', async () => await AppPushService.badge.get())} theme={theme} />
          <Btn label="set(5)" onPress={run('badge.set(5)', async () => await AppPushService.badge.set(5))} theme={theme} />
          <Btn label="increment()" onPress={run('badge.increment', async () => await AppPushService.badge.increment())} theme={theme} />
          <Btn label="clear" onPress={run('badge.clear', async () => await AppPushService.badge.clear())} theme={theme} />
        </Section>

        <Section title="User" theme={theme}>
          <Btn label="addTag(plan, pro)" onPress={run('user.addTag', async () => await AppPushService.user.addTag('plan', 'pro'))} theme={theme} />
          <Btn label="getTags" onPress={run('user.getTags', async () => await AppPushService.user.getTags())} theme={theme} />
          <Btn label="removeTag(plan)" onPress={run('user.removeTag', async () => await AppPushService.user.removeTag('plan'))} theme={theme} />
          <Btn label="addAlias(crm, c-1)" onPress={run('user.addAlias', async () => await AppPushService.user.addAlias('crm', 'c-1'))} theme={theme} />
          <Btn label="setLanguage(en)" onPress={run('user.setLanguage', async () => await AppPushService.user.setLanguage('en'))} theme={theme} />
          <Btn label="getLanguage" onPress={run('user.getLanguage', async () => await AppPushService.user.getLanguage())} theme={theme} />
          <Btn label="getPushSubscription" onPress={run('user.getPushSubscription', async () => await AppPushService.user.getPushSubscription())} theme={theme} />
          <Btn label="optOut" onPress={run('user.optOut', async () => await AppPushService.user.optOut())} theme={theme} />
          <Btn label="optIn" onPress={run('user.optIn', async () => await AppPushService.user.optIn())} theme={theme} />
        </Section>

        <Section title="Misc" theme={theme}>
          <Btn label="setLogLevel(verbose)" onPress={run('debug.setLogLevel', async () => await AppPushService.debug.setLogLevel('verbose'))} theme={theme} />
          <Btn label="consent.setRequired(true)" onPress={run('consent.setRequired', async () => await AppPushService.consent.setRequired(true))} theme={theme} />
          <Btn label="consent.getRequired" onPress={run('consent.getRequired', async () => await AppPushService.consent.getRequired())} theme={theme} />
          <Btn label="consent.setGiven(true)" onPress={run('consent.setGiven', async () => await AppPushService.consent.setGiven(true))} theme={theme} />
          <Btn label="consent.getGiven" onPress={run('consent.getGiven', async () => await AppPushService.consent.getGiven())} theme={theme} />
        </Section>

        <View style={styles.logHeader}>
          <Text style={[styles.sectionTitle, theme.text]}>Log</Text>
          <TouchableOpacity onPress={() => setLog([])}>
            <Text style={theme.muted}>clear</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.logBox, theme.card]}>
          {log.length === 0 ? (
            <Text style={theme.muted}>Nothing yet — start with “initialize”.</Text>
          ) : (
            log.map((entry) => (
              <Text key={entry.id} style={[styles.logLine, theme[entry.kind]]}>
                {PREFIX[entry.kind]} {entry.text}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const PREFIX: Record<LogEntry['kind'], string> = {
  call: '›',
  ok: '✓',
  err: '✗',
  event: '⚡',
};

function Banner({ theme, initialized }: { theme: Theme; initialized: boolean }) {
  const arch = hasTurboModules ? 'New Architecture' : 'Old Architecture';
  const path = hasTurboModules ? 'TurboModule (Codegen)' : 'Bridge (NativeModule)';
  return (
    <View style={[styles.banner, theme.card]}>
      <Text style={[styles.bannerTitle, theme.text]}>{arch}</Text>
      <Text style={[styles.bannerPath, hasTurboModules ? theme.ok : theme.warn]}>{path}</Text>
      <Text style={theme.muted}>
        {Platform.OS} · bridgeless {String(isBridgeless)} · fabric {String(hasFabric)}
      </Text>
      <Text style={initialized ? theme.ok : theme.muted}>
        SDK {initialized ? 'initialized' : 'not initialized'}
      </Text>
    </View>
  );
}

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, theme.text]}>{title}</Text>
      <View style={styles.row}>{children}</View>
    </View>
  );
}

function Btn({
  label,
  onPress,
  theme,
  primary,
}: {
  label: string;
  onPress: () => void;
  theme: Theme;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, primary ? theme.btnPrimary : theme.btn]}
      onPress={onPress}
    >
      <Text style={primary ? theme.btnPrimaryText : theme.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function format(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'ok';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function truncate(value: string): string {
  return value.length > 24 ? `${value.slice(0, 24)}…` : value;
}

type Theme = Record<string, object>;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 18 },
  banner: { padding: 14, borderRadius: 12, gap: 2 },
  bannerTitle: { fontSize: 20, fontWeight: '700' },
  bannerPath: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logBox: { padding: 12, borderRadius: 12, gap: 3, minHeight: 120 },
  logLine: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});

const light: Theme = {
  screen: { backgroundColor: '#f4f4f5' },
  card: { backgroundColor: '#ffffff' },
  text: { color: '#18181b' },
  muted: { color: '#71717a', fontSize: 12 },
  ok: { color: '#15803d', fontSize: 12 },
  warn: { color: '#b45309', fontSize: 12 },
  err: { color: '#b91c1c', fontSize: 12 },
  call: { color: '#52525b', fontSize: 12 },
  event: { color: '#6d28d9', fontSize: 12 },
  btn: { backgroundColor: '#e4e4e7' },
  btnText: { color: '#18181b', fontSize: 13 },
  btnPrimary: { backgroundColor: '#2563eb' },
  btnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
};

const dark: Theme = {
  screen: { backgroundColor: '#09090b' },
  card: { backgroundColor: '#18181b' },
  text: { color: '#fafafa' },
  muted: { color: '#a1a1aa', fontSize: 12 },
  ok: { color: '#4ade80', fontSize: 12 },
  warn: { color: '#fbbf24', fontSize: 12 },
  err: { color: '#f87171', fontSize: 12 },
  call: { color: '#d4d4d8', fontSize: 12 },
  event: { color: '#c4b5fd', fontSize: 12 },
  btn: { backgroundColor: '#27272a' },
  btnText: { color: '#fafafa', fontSize: 13 },
  btnPrimary: { backgroundColor: '#3b82f6' },
  btnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
};
