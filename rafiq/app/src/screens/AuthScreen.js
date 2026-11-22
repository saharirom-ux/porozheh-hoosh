import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors, text, row } from '../theme';
import { useApp, requestApi } from '../store';

export default function AuthScreen() {
  const { login, register } = useApp();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), displayName.trim(), password);
    } catch (e) {
      setError(e.message || 'خطایی رخ داد');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    username.trim().length >= 3 && password.length >= 6 && (mode === 'login' || displayName.trim().length > 0);

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.logo}>رفیق</Text>
        <Text style={styles.sub}>پیام‌هایت فقط برای خودتان و طرف مقابل خوانا هستند</Text>

        <View style={[row, styles.tabs]}>
          <TouchableOpacity style={[styles.tab, mode === 'login' && styles.tabActive]} onPress={() => setMode('login')}>
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>ورود</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, mode === 'register' && styles.tabActive]} onPress={() => setMode('register')}>
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>ساخت حساب</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>شناسه (فقط حروف انگلیسی و عدد)</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ali"
          placeholderTextColor={colors.textDim}
          textAlign="left"
          writingDirection="ltr"
        />

        {mode === 'register' ? (
          <>
            <Text style={styles.label}>نام نمایشی</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="علی"
              placeholderTextColor={colors.textDim}
            />
          </>
        ) : null}

        <Text style={styles.label}>رمز عبور</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="دست‌کم ۶ کاراکتر"
          placeholderTextColor={colors.textDim}
          textAlign="left"
          writingDirection="ltr"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={[styles.button, (!canSubmit || busy) && styles.disabled]} onPress={submit} disabled={busy || !canSubmit}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mode === 'login' ? 'ورود' : 'ساخت حساب'}</Text>}
        </TouchableOpacity>

        <Text style={styles.footnote}>
          {mode === 'register'
            ? 'رمز عبور فقط نزد توست؛ اگر فراموشش کنی بازیابی‌شدنی نیست.'
            : `سرویس: ${requestApi.getServerUrl()}`}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 22 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 22 },
  logo: { ...text, fontSize: 30, fontWeight: '800', textAlign: 'center', color: colors.accent },
  sub: { ...text, textAlign: 'center', color: colors.textDim, marginTop: 6, marginBottom: 22, fontSize: 13 },
  tabs: { backgroundColor: colors.surface2, borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { ...text, color: colors.textDim, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  label: { ...text, color: colors.textDim, marginBottom: 7, fontSize: 13 },
  input: {
    ...text,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    marginBottom: 14,
  },
  error: { ...text, color: colors.danger, marginBottom: 10, fontSize: 13 },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, marginTop: 8, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  buttonText: { ...text, color: '#fff', fontWeight: '700', fontSize: 16 },
  footnote: { ...text, color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 16 },
});
