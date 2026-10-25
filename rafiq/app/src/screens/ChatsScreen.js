import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { colors, text, row, timeLabel } from '../theme';
import Avatar from '../components/Avatar';
import { useApp } from '../store';
import { decryptMessage } from '../store';
import { getChatKey } from '../keys';

/** Decrypts the last message for the list preview, in isolation. */
function Preview({ entry }) {
  const { me } = useApp();
  const [value, setValue] = useState('…');

  const last = entry.lastMessage;
  const senderName = last && entry.chat.type === 'group' ? entry.members.find((m) => m.id === last.senderId)?.displayName : null;
  const prefix = last && last.senderId === me?.id ? 'شما: ' : senderName ? `${senderName}: ` : '';

  React.useEffect(() => {
    let alive = true;
    if (!last) {
      setValue('هنوز پیامی نیست');
      return;
    }
    getChatKey(entry.chat.id, last.keyVersion).then((key) => {
      if (!alive) return;
      const msg = decryptMessage(last, key);
      if (msg.pending) setValue('قفل شده 🔒');
      else if (msg.t === 'file') setValue(`${prefix}📎 ${msg.name || 'فایل'}`);
      else if (msg.t === 'reaction') setValue(`${prefix}واکنش ${msg.emoji || ''}`);
      else setValue(prefix + (msg.text || ''));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id, last?.body, entry.chat.id, last?.keyVersion]);

  return (
    <Text style={styles.preview} numberOfLines={1}>
      {value}
    </Text>
  );
}

export default function ChatsScreen({ nav }) {
  const { chats, me, typing, isOnline, refreshChats, markRead } = useApp();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const titleOf = useCallback(
    (entry) => {
      if (entry.chat.type === 'group') return entry.chat.name || 'گروه';
      const peer = entry.members.find((m) => m.id !== me?.id);
      return peer?.displayName || peer?.username || 'گفتگو';
    },
    [me],
  );

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = chats.map((entry) => ({ entry, title: titleOf(entry) }));
    if (!q) return list;
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.entry.members.some((m) => m.username.toLowerCase().includes(q)),
    );
  }, [chats, query, titleOf]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshChats();
    } finally {
      setRefreshing(false);
    }
  }, [refreshChats]);

  const open = useCallback(
    (entry) => {
      markRead(entry.chat.id);
      nav.push({ name: 'chat', entry });
    },
    [markRead, nav],
  );

  const renderItem = useCallback(
    ({ item }) => {
      const entry = item.entry;
      const holders = typing[String(entry.chat.id)] || {};
      const typingIds = Object.keys(holders)
        .map(Number)
        .filter((id) => id !== me?.id);
      const isTyping = typingIds.length > 0;
      const peer = entry.chat.type === 'dm' ? entry.members.find((m) => m.id !== me?.id) : null;

      return (
        <TouchableOpacity style={styles.item} onPress={() => open(entry)} activeOpacity={0.7}>
          <Avatar name={item.title} color={entry.chat.avatarColor} online={peer ? isOnline(peer.id) : false} />
          <View style={styles.body}>
            <View style={[row, styles.itemTop]}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.time}>{entry.lastMessage ? timeLabel(entry.lastMessage.createdAt) : ''}</Text>
            </View>
            <View style={[row, styles.itemBottom]}>
              <View style={styles.previewWrap}>
                {isTyping ? <Text style={styles.typing}>در حال نوشتن…</Text> : <Preview entry={entry} />}
              </View>
              {entry.unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{entry.unread > 99 ? '۹۹+' : entry.unread}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [isOnline, me, open, typing],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>رفیق</Text>
        <View style={[row, styles.headerActions]}>
          <TouchableOpacity style={styles.iconButton} onPress={() => nav.push({ name: 'newChat' })}>
            <Text style={styles.iconText}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => nav.push({ name: 'settings' })}>
            <Text style={styles.iconText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="جستجو در گفتگوها"
          placeholderTextColor={colors.textDim}
        />
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => String(item.entry.chat.id)}
        renderItem={renderItem}
        contentContainerStyle={data.length ? styles.listContent : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query ? 'چیزی پیدا نشد' : 'هنوز گفتگویی نداری\nبا دکمه ✏️ اولین گفتگو را بساز'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { ...row, justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerTitle: { ...text, fontSize: 21, fontWeight: '800', color: colors.accent },
  headerActions: { gap: 6 },
  iconButton: { padding: 8, borderRadius: 10 },
  iconText: { fontSize: 19 },
  searchWrap: { paddingHorizontal: 14, paddingBottom: 8 },
  search: {
    ...text,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  listContent: { paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { ...text, textAlign: 'center', color: colors.textDim, lineHeight: 26 },
  item: { ...rowStart, paddingHorizontal: 14, paddingVertical: 11, gap: 12 },
  body: { flex: 1 },
  itemTop: { justifyContent: 'space-between', marginBottom: 3 },
  title: { ...text, fontWeight: '700', fontSize: 15.5, flex: 1 },
  time: { ...text, color: colors.textDim, fontSize: 12, marginStart: 8 },
  itemBottom: { justifyContent: 'space-between' },
  previewWrap: { flex: 1 },
  preview: { ...text, color: colors.textDim, fontSize: 13.5 },
  typing: { ...text, color: colors.accent, fontSize: 13.5 },
  badge: {
    backgroundColor: colors.accent,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginStart: 8,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
