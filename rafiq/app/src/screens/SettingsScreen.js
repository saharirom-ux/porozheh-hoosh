// Account, server and security overview.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking, ScrollView } from 'react-native';
import { colors, text, row } from '../theme';
import Avatar from '../components/Avatar';
import { useApp, requestApi } from '../store';
import { getChatKey } from '../keys';

export default function SettingsScreen({ nav }) {
  const { me, logout, busy } = useApp();
  const [checking, setChecking] = useState(false);

  const confirmLogout = () => {
    Alert.alert('خروج از حساب', 'برای ورود دوباره به رمز عبور نیاز داری. مطمئنی؟', [
      { text: 'بمان', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: logout },
    ]);
  };

  const checkKeys = async () => {
    setChecking(true);
    try {
      const { chats } = await requestApi.request('/chats');
      const held = [];
      for (const entry of chats) {
        const key = await getChatKey(entry.chat.id, entry.chat.keyVersion);
        if (key) held.push(entry.chat.type === 'group' ? entry.chat.name : 'گفتگوی خصوصی');
      }
      Alert.alert(
        'کلیدهای روی این دستگاه',
        held.length
          ? `کلید ${held.length} گفتگو روی این دستگاه ذخیره است:\n${held.join('\n')}\n\nاین کلیدها هرگز از دستگاه خارج نمی‌شوند.`
          : 'هنوز هیچ کلیدی روی این دستگاه ذخیره نشده.',
      );
    } catch (e) {
      Alert.alert('بررسی نشد', e.message || 'خطایی رخ داد');
    } finally {
      setChecking(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => nav.pop()}>
          <Text style={styles.backText}>›</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تنظیمات</Text>
      </View>

      {me ? (
        <View style={[row, styles.card]}>
          <Avatar name={me.displayName || me.username} color={me.avatarColor} size={56} />
          <View style={styles.cardBody}>
            <Text style={styles.name}>{me.displayName || me.username}</Text>
            <Text style={styles.handle}>@{me.username}</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>سرور</Text>
      <View style={styles.card}>
        <Text style={styles.mono} selectable>
          {requestApi.getServerUrl() || 'تنظیم نشده'}
        </Text>
      </View>

      <Text style={styles.section}>امنیت</Text>
      <View style={styles.card}>
        <Text style={styles.cardText}>
          پیام‌ها روی دستگاه تو رمزنگاری می‌شوند و سرور فقط متن رمزشده را نگه می‌دارد. کلید خصوصی هرگز از دستگاه خارج نمی‌شود.
        </Text>
        <TouchableOpacity style={styles.link} onPress={checkKeys} disabled={checking}>
          <Text style={styles.linkText}>{checking ? 'در حال بررسی…' : 'بررسی کلیدهای ذخیره‌شده'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logout} onPress={confirmLogout} disabled={busy}>
        <Text style={styles.logoutText}>خروج از حساب</Text>
      </TouchableOpacity>

      <Text style={styles.version}>رفیق — نسخه ۱٫۰٫۰</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 30 },
  header: {
    ...row,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  back: { padding: 6 },
  backText: { color: colors.text, fontSize: 28, lineHeight: 30, transform: [{ scaleX: -1 }] },
  headerTitle: { ...text, fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 12,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardBody: { flex: 1 },
  name: { ...text, fontSize: 16, fontWeight: '700' },
  handle: { ...text, color: colors.textDim, fontSize: 13, marginTop: 2 },
  mono: { ...text, fontSize: 13, color: colors.accent, writingDirection: 'ltr', textAlign: 'left' },
  section: { ...text, color: colors.textDim, fontSize: 12.5, marginHorizontal: 16, marginTop: 20, marginBottom: 7 },
  cardText: { ...text, color: colors.textDim, fontSize: 13, lineHeight: 21 },
  link: { marginTop: 4 },
  linkText: { ...text, color: colors.accent, fontSize: 13, fontWeight: '600' },
  logout: {
    marginHorizontal: 12,
    marginTop: 24,
    backgroundColor: 'rgba(224,85,90,0.12)',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  logoutText: { ...text, color: colors.danger, fontWeight: '700', fontSize: 15 },
  version: { ...text, color: colors.textDim, fontSize: 11.5, textAlign: 'center', marginTop: 22 },
});
