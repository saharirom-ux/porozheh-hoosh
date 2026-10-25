import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExFile } from 'expo-file-system';
import { colors, text, row, dayLabel } from '../theme';
import Avatar from '../components/Avatar';
import MessageBubble from '../components/MessageBubble';
import { useApp, decryptMessage } from '../store';

function DaySeparator({ ts }) {
  return (
    <View style={styles.dayWrap}>
      <Text style={styles.dayText}>{dayLabel(ts)}</Text>
    </View>
  );
}

export default function ChatScreen({ nav, entry }) {
  const app = useApp();
  const { me, messages, typing, presence, decryptTick, busy } = app;

  const [key, setKey] = useState(null);
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const typingTimer = useRef(0);

  const chatId = entry.chat.id;
  const raw = messages[String(chatId)] || [];

  const title = useMemo(() => {
    if (entry.chat.type === 'group') return entry.chat.name || 'گروه';
    const peer = entry.members.find((m) => m.id !== me?.id);
    return peer?.displayName || peer?.username || 'گفتگو';
  }, [entry, me]);

  const peer = entry.chat.type === 'dm' ? entry.members.find((m) => m.id !== me?.id) : null;

  useEffect(() => {
    let alive = true;
    app.openChat(entry).then((k) => {
      if (alive) setKey(k);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, entry.chat.keyVersion]);

  useEffect(() => {
    app.markRead(chatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, raw.length]);

  // Decrypt everything we can; messages we cannot open stay locked.
  const items = useMemo(() => {
    const byId = new Map();
    const unlocked = raw.map((r) => {
      const k = r.keyVersion === entry.chat.keyVersion ? key : null;
      const msg = decryptMessage(r, k);
      byId.set(r.id, msg);
      return msg;
    });
    const readable = new Map();
    for (const m of unlocked) {
      if (!m.pending && m.t === 'text') readable.set(m.id, m.text);
    }
    return unlocked.map((m) => ({
      ...m,
      replyPreview: m.replyTo ? readable.get(m.replyTo) || null : null,
    }));
  }, [raw, key, entry.chat.keyVersion, decryptTick]);

  // Ask for a key if anything is still locked.
  useEffect(() => {
    if (items.some((m) => m.pending)) {
      app.openChat(entry).then(setKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const reactionsByTarget = useMemo(() => {
    const map = {};
    for (const m of items) {
      if (m.t !== 'reaction' || m.pending) continue;
      if (!map[m.target]) map[m.target] = [];
      if (!map[m.target].some((r) => r.emoji === m.emoji)) map[m.target].push({ emoji: m.emoji, from: m.senderId });
    }
    return map;
  }, [items]);

  const visible = useMemo(() => items.filter((m) => m.t !== 'reaction'), [items]);

  const typingIds = useMemo(() => {
    const holders = typing[String(chatId)] || {};
    return Object.keys(holders)
      .map(Number)
      .filter((id) => id !== me?.id);
  }, [typing, chatId, me]);

  const readBy = (msg) => Object.entries(entry.receipts || {}).some(([uid, last]) => Number(uid) !== me?.id && last >= msg.id);

  const doSend = useCallback(async () => {
    const value = draft.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await app.sendText(entry, value, reply?.id || null);
      setDraft('');
      setReply(null);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    } catch (e) {
      Alert.alert('ارسال نشد', e.message || 'خطایی رخ داد');
    } finally {
      setSending(false);
    }
  }, [app, draft, entry, reply, sending]);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('دسترسی لازم نیست', 'برای فرستادن عکس به دسترسی تصاویر نیاز است');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('خطا', 'خواندن عکس ممکن نشد');
      return;
    }
    try {
      await app.sendFile(entry, { name: asset.fileName || 'photo.jpg', mime: asset.mimeType || 'image/jpeg', base64: asset.base64 });
    } catch (e) {
      Alert.alert('ارسال نشد', e.message || 'خطایی رخ داد');
    }
  }, [app, entry]);

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    try {
      const file = new ExFile(asset.uri);
      const base64 = await file.base64();
      await app.sendFile(entry, {
        name: asset.name || 'file',
        mime: asset.mimeType || 'application/octet-stream',
        base64,
      });
    } catch (e) {
      Alert.alert('ارسال نشد', e.message || 'خواندن فایل ممکن نشد');
    }
  }, [app, entry]);

  const onTextChange = (value) => {
    setDraft(value);
    const now = Date.now();
    if (now - typingTimer.current > 2500) {
      typingTimer.current = now;
      app.setTypingNow(chatId);
    }
  };

  const renderItem = useCallback(
    ({ item, index }) => {
      const mine = item.senderId === me?.id;
      const prev = visible[index - 1];
      const showSender = entry.chat.type === 'group' && (!prev || prev.senderId !== item.senderId);
      const sender = entry.members.find((m) => m.id === item.senderId) || null;
      const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(item.createdAt);

      return (
        <View>
          {showDay ? <DaySeparator ts={item.createdAt} /> : null}
          <MessageBubble
            msg={item}
            mine={mine}
            sender={sender}
            showSender={showSender && !mine}
            reactions={reactionsByTarget[item.id]}
            readByOthers={mine && readBy(item)}
            onReact={(target, emoji) => app.sendReaction(entry, target, emoji).catch((e) => Alert.alert('خطا', e.message))}
            onReply={(m) => setReply(m)}
          />
        </View>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, entry, me, reactionsByTarget, visible],
  );

  const status = typingIds.length
    ? entry.chat.type === 'group'
      ? `${typingIds.length} نفر در حال نوشتن…`
      : 'در حال نوشتن…'
    : peer
      ? app.isOnline(peer.id)
        ? 'آنلاین'
        : 'آفلاین'
    : `${entry.members.length} عضو`;

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => nav.pop()}>
          <Text style={styles.backText}>›</Text>
        </TouchableOpacity>
        <Avatar name={title} color={entry.chat.avatarColor} size={38} online={peer ? app.isOnline(peer.id) : false} />
        <View style={styles.headerBody}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.headerStatus, typingIds.length && { color: colors.accent }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </View>

      {!key ? (
        <View style={styles.keyBanner}>
          <Text style={styles.keyBannerText}>در حال آماده‌سازی رمزنگاری…</Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={visible}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.emptyChat}>هنوز پیامی در این گفتگو نیست</Text>}
      />

      {typingIds.length ? (
        <Text style={styles.typingBar}>
          {entry.chat.type === 'group' ? `${typingIds.length} نفر تایپ می‌کنند` : 'در حال نوشتن…'}
        </Text>
      ) : null}

      {reply ? (
        <View style={[row, styles.replyBar]}>
          <TouchableOpacity onPress={() => setReply(null)} style={styles.replyClose}>
            <Text style={styles.replyCloseText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.replyBody}>
            <Text style={styles.replyTitle} numberOfLines={1}>
              پاسخ به {entry.members.find((m) => m.id === reply.senderId)?.displayName || ''}
            </Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {reply.text || '📎 فایل'}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attach} onPress={pickImage}>
          <Text style={styles.attachText}>🖼️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.attach} onPress={pickFile}>
          <Text style={styles.attachText}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={onTextChange}
          placeholder="پیام…"
          placeholderTextColor={colors.textDim}
          multiline
        />
        <TouchableOpacity
          style={[styles.send, (!draft.trim() || sending || busy) && styles.sendDisabled]}
          onPress={doSend}
          disabled={!draft.trim() || sending || busy}
        >
          {sending || busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>➤</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: {
    ...row,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  back: { padding: 6 },
  backText: { color: colors.text, fontSize: 28, lineHeight: 30, transform: [{ scaleX: -1 }] },
  headerBody: { flex: 1 },
  headerTitle: { ...text, fontSize: 16, fontWeight: '700' },
  headerStatus: { ...text, fontSize: 12, color: colors.textDim, marginTop: 1 },
  keyBanner: { backgroundColor: colors.surface2, paddingVertical: 6, alignItems: 'center' },
  keyBannerText: { ...text, fontSize: 12, color: colors.warn },
  listContent: { paddingVertical: 10, paddingBottom: 6 },
  emptyChat: { ...text, textAlign: 'center', color: colors.textDim, marginTop: 60 },
  dayWrap: { alignItems: 'center', marginVertical: 10 },
  dayText: {
    ...text,
    fontSize: 11.5,
    color: colors.textDim,
    backgroundColor: colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  typingBar: { ...text, color: colors.accent, fontSize: 12.5, paddingHorizontal: 16, paddingBottom: 6 },
  replyBar: {
    backgroundColor: colors.surface2,
    marginHorizontal: 10,
    marginBottom: 6,
    borderRadius: 10,
    padding: 8,
    gap: 8,
  },
  replyClose: { padding: 4 },
  replyCloseText: { color: colors.textDim, fontSize: 14 },
  replyBody: { flex: 1 },
  replyTitle: { ...text, fontSize: 12.5, color: colors.accent, fontWeight: '600' },
  replyText: { ...text, fontSize: 12.5, color: colors.textDim, marginTop: 2 },
  inputBar: {
    ...row,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    alignItems: 'flex-end',
  },
  attach: { padding: 8 },
  attachText: { fontSize: 20 },
  input: {
    ...text,
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.surface2,
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 7,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#fff', fontSize: 17, transform: [{ scaleX: -1 }] },
});
