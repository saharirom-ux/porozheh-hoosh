// Details of a conversation: who is in it, which key protects it, and — for
// groups — who can be added or removed.

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors, text, row } from '../theme';
import Avatar from '../components/Avatar';
import { useApp } from '../store';
import { getChatKey } from '../keys';
import { bytesToBase64 } from '../crypto';

export default function ChatInfoScreen({ nav, entry: initialEntry }) {
  const { me, addMembers, removeMember, isOnline } = useApp();

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [fingerprint, setFingerprint] = useState(null);

  const chat = initialEntry.chat;
  const members = initialEntry.members || [];
  const isGroup = chat.type === 'group';

  const loadFingerprint = useCallback(async () => {
    const key = await getChatKey(chat.id, chat.keyVersion);
    if (!key) {
      setFingerprint(null);
      return;
    }
    setFingerprint(bytesToBase64(key).slice(0, 16).replace(/(.{4})/g, '$1 ').trim());
  }, [chat.id, chat.keyVersion]);

  React.useEffect(() => {
    loadFingerprint().catch(() => {});
  }, [loadFingerprint]);

  const title = useMemo(() => {
    if (isGroup) return chat.name || 'گروه';
    const peer = members.find((m) => m.id !== me?.id);
    return peer?.displayName || peer?.username || 'گفتگو';
  }, [isGroup, chat.name, members, me]);

  const addMember = useCallback(async () => {
    const username = query.trim();
    if (!username) return;
    setBusy(true);
    try {
      await addMembers(initialEntry, [username]);
      setQuery('');
      Alert.alert('انجام شد', `${username} به گفتگو اضافه شد`);
    } catch (e) {
      Alert.alert('اضافه نشد', e.message || 'خطایی رخ داد');
    } finally {
      setBusy(false);
    }
  }, [addMembers, initialEntry, query]);

  const kick = useCallback(
    (member) => {
      Alert.alert('حذف از گفتگو', `${member.displayName || member.username} حذف شود؟ کلید گفتگو عوض می‌شود و پیام‌های بعدی برای او خوانده نمی‌شود.`, [
        { text: 'بمان', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(initialEntry, member.id);
              nav.pop();
            } catch (e) {
              Alert.alert('حذف نشد', e.message || 'خطایی رخ داد');
            }
          },
        },
      ]);
    },
    [initialEntry, nav, removeMember],
  );

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => nav.pop()}>
          <Text style={styles.backText}>›</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>اطلاعات گفتگو</Text>
      </View>

      <View style={styles.hero}>
        <Avatar name={title} color={chat.avatarColor} size={72} />
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSub}>
          {isGroup ? `${members.length} عضو` : members.find((m) => m.id !== me?.id)?.username || ''}
        </Text>
      </View>

      <Text style={styles.section}>رمزنگاری</Text>
      <View style={styles.card}>
        <Text style={styles.cardText}>
          همه پیام‌های این گفتگو با کلیدی رمزنگاری می‌شوند که فقط اعضای گفتگو به آن دسترسی دارند. سرور کلید را نمی‌بیند.
        </Text>
        <Text style={styles.keyLabel}>اثر انگشت کلید</Text>
        <Text style={styles.fingerprint} selectable>
          {fingerprint || 'کلید هنوز در دسترس نیست'}
        </Text>
      </View>

      <Text style={styles.section}>اعضا</Text>
      <View style={styles.card}>
        {members.map((member) => (
          <View key={member.id} style={[row, styles.member]}>
            <Avatar
              name={member.displayName || member.username}
              color={member.avatarColor}
              size={40}
              online={isOnline(member.id)}
            />
            <View style={styles.memberBody}>
              <Text style={styles.memberName}>
                {member.displayName || member.username}
                {member.id === me?.id ? ' (خودت)' : ''}
              </Text>
              <Text style={styles.memberHandle}>@{member.username}</Text>
            </View>
            {isGroup && member.id !== me?.id ? (
              <TouchableOpacity onPress={() => kick(member)} hitSlop={8}>
                <Text style={styles.remove}>حذف</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>

      {isGroup ? (
        <>
          <Text style={styles.section}>افزودن عضو</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="شناسه کاربر"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              writingDirection="ltr"
              textAlign="left"
            />
            <TouchableOpacity
              style={[styles.button, (!query.trim() || busy) && styles.disabled]}
              onPress={addMember}
              disabled={!query.trim() || busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>افزودن به گفتگو</Text>}
            </TouchableOpacity>
            <Text style={styles.hint}>کلید گفتگو برای عضو جدید، از طرف اعضای فعلی رمزگذاری و فرستاده می‌شود.</Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 34 },
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
  hero: { alignItems: 'center', paddingVertical: 22, gap: 4 },
  heroTitle: { ...text, fontSize: 19, fontWeight: '700', marginTop: 10 },
  heroSub: { ...text, color: colors.textDim, fontSize: 13 },
  section: { ...text, color: colors.textDim, fontSize: 12.5, marginHorizontal: 16, marginTop: 18, marginBottom: 7 },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 12,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardText: { ...text, color: colors.textDim, fontSize: 13, lineHeight: 21 },
  keyLabel: { ...text, color: colors.textDim, fontSize: 12, marginTop: 6 },
  fingerprint: {
    ...text,
    color: colors.accent,
    fontSize: 13,
    writingDirection: 'ltr',
    textAlign: 'left',
    letterSpacing: 1,
  },
  member: { paddingVertical: 8, gap: 12 },
  memberBody: { flex: 1 },
  memberName: { ...text, fontSize: 14.5, fontWeight: '600' },
  memberHandle: { ...text, color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  remove: { ...text, color: colors.danger, fontSize: 13, fontWeight: '600' },
  input: {
    ...text,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  buttonText: { ...text, color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { ...text, color: colors.textDim, fontSize: 12, lineHeight: 19 },
});
