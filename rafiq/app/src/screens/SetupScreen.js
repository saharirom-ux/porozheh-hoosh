import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { colors, text } from '../theme';
import { useApp } from '../store';

export default function SetupScreen() {
  const { configureServer } = useApp();
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = url.trim();
    if (!/^https?:\/\//.test(value)) return;
    setSaving(true);
    try {
      await configureServer(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.logo}>رفیق</Text>
        <Text style={styles.sub}>چت خصوصی با رمزنگاری سرتاسری</Text>

        <Text style={styles.label}>آدرس سرور</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.1.10:3000"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          dir="ltr"
          textAlign="left"
        />
        <Text style={styles.hint}>
          سرور باید در دسترس بقیه باشد؛ روی رایانه خودت با آدرس لوکال تست کن و برای دوست‌ها آدرس عمومی (مانند یک VPS) بگذار.
        </Text>

        <TouchableOpacity style={[styles.button, (!/^https?:\/\//.test(url.trim()) || saving) && styles.disabled]} onPress={save} disabled={saving || !/^https?:\/\//.test(url.trim())}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>ذخیره و ادامه</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 22 },
  logo: { ...text, fontSize: 32, fontWeight: '800', textAlign: 'center', color: colors.accent },
  sub: { ...text, textAlign: 'center', color: colors.textDim, marginTop: 6, marginBottom: 26 },
  label: { ...text, color: colors.textDim, marginBottom: 8 },
  input: {
    ...text,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  hint: { ...text, color: colors.textDim, fontSize: 12, marginTop: 12, lineHeight: 19 },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, marginTop: 22, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  buttonText: { ...text, color: '#fff', fontWeight: '700', fontSize: 16 },
});
