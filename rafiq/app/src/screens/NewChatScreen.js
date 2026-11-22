// Starting a new private chat.
//
// A direct chat needs only the friend's username: the key is derived from
// both identities, so nothing has to be negotiated for it to work.

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors, text, row } from '../theme';
import Avatar from '../components/Avatar';
import { useApp } from '../store';
import { searchUsers } from '../api';

export default function NewChatScreen({ nav }) {
  const { me, createDm, createGroup } = useApp();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [picked, setPicked] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const runSearch = useCallback(async (value) => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const users = await searchUsers(q);
      setResults(users.filter((u) => u.id !== me?.id));
    } catch (e) {
      Alert.alert('جستجو نشد', e.message || 'خطایی رخ داد');
    } finally {
      setSearching(false);
    }
  }, [me]);

  const openDm = useCallback(
    async (username) => {
      if (opening) return;
      setOpening(username);
      try {
        const entry = await createDm(username);
        nav.replace({ name: 'chat', entry });
      } catch (e) {
        Alert.alert('گفتگو ساخته نشد', e.message || 'خطایی رخ داد');
      } finally {
        setOpening(null);
      }
    },
    [createDm, nav, opening],
  );

  const togglePick = useCallback((user) => {
    setPicked((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      return exists ? prev.filter((u) => u.id !== user.id) : [...prev, user];
    });
  }, []);

  const submitGroup = useCallback(async () => {
    const name = groupName.trim();
    if (!name) {
      Alert.alert('نام لازم است', 'برای گروه یک نام بگذار');
      return;
    }
    if (!picked.length) {
      Alert.alert('عضو لازم است', 'حداقل یک نفر را انتخاب کن');
      return;
    }
    setCreatingGroup(true);
    try {
      const entry = await createGroup(name, picked.map((u) => u.username));
      nav.replace({ name: 'chat', entry });
    } catch (e) {
      Alert.alert('گروه ساخته نشد', e.message || 'خطایی رخ داد');
    } finally {
      setCreatingGroup(false);
    }
  }, [createGroup, groupName, nav, picked]);

  const direct = useMemo(() => picked.filter((u) => u.username), [picked]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => nav.pop()}>
          <Text style={styles.backText}>›</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>گفتگوی جدید</Text>
      </View>

      <Text style={styles.label}>شناسه یا نام دوست</Text>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          runSearch(value);
        }}
        placeholder="مثلاً ali یا علی"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {searching ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

      {results.length ? (
        <Text style={styles.sectionTitle}>نتیجه‌ها</Text>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={results.length ? styles.listContent : styles.emptyList}
        ListEmptyComponent={
          searching ? null : (
            <Text style={styles.empty}>
              {query.trim().length >= 2 ? 'کسی با این نام پیدا نشد' : 'نام یا شناسه دوستت را بنویس'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.user}
            activeOpacity={0.7}
            onPress={() => openDm(item.username)}
            disabled={!!opening}
          >
            <Avatar name={item.displayName || item.username} color={item.avatarColor} size={44} />
            <View style={styles.userBody}>
              <Text style={styles.userName}>{item.displayName || item.username}</Text>
              <Text style={styles.userHandle}>@{item.username}</Text>
            </View>
            {opening === item.username ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={styles.start}>شروع گفتگو</Text>
            )}
          </TouchableOpacity>
        )}
      />

      <View style={styles.groupBox}>
        <Text style={styles.label}>یا گروه بساز</Text>
        <TextInput
          style={styles.input}
          value={groupName}
          onChangeText={setGroupName}
          placeholder="نام گروه"
          placeholderTextColor={colors.textDim}
        />

        {picked.length ? (
          <View style={styles.chips}>
            {picked.map((u) => (
              <TouchableOpacity key={u.id} style={styles.chip} onPress={() => togglePick(u)}>
                <Text style={styles.chipText}>{u.displayName || u.username} ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <Text style={styles.hint}>
          {direct.length
            ? `${direct.length} نفر انتخاب شده — برای افزودن نفر بیشتر، از نتیجه‌های جستجو روی نامشان بزن.`
            : 'برای ساخت گروه، اعضا را از نتیجه‌های جستجو انتخاب کن.'}
        </Text>

        <TouchableOpacity
          style={[styles.button, (!groupName.trim() || !direct.length || creatingGroup) && styles.disabled]}
          onPress={submitGroup}
          disabled={!groupName.trim() || !direct.length || creatingGroup}
        >
          {creatingGroup ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>ساخت گروه</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
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
  label: { ...text, color: colors.textDim, fontSize: 13, marginTop: 14, marginHorizontal: 14, marginBottom: 6 },
  input: {
    ...text,
    marginHorizontal: 14,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  spinner: { marginTop: 12 },
  sectionTitle: { ...text, color: colors.textDim, fontSize: 13, marginHorizontal: 14, marginTop: 14 },
  listContent: { paddingBottom: 8 },
  emptyList: { flexGrow: 0 },
  empty: { ...text, textAlign: 'center', color: colors.textDim, marginTop: 24 },
  user: { ...row, paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  userBody: { flex: 1 },
  userName: { ...text, fontSize: 15, fontWeight: '600' },
  userHandle: { ...text, color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  start: { ...text, color: colors.accent, fontSize: 13 },
  groupBox: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
    paddingBottom: 18,
    paddingTop: 4,
  },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, marginTop: 10 },
  chip: { backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { ...text, fontSize: 12.5, color: colors.accent },
  hint: { ...text, color: colors.textDim, fontSize: 12, marginHorizontal: 14, marginTop: 12, lineHeight: 19 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    marginHorizontal: 14,
    marginTop: 14,
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  buttonText: { ...text, color: '#fff', fontWeight: '700', fontSize: 15 },
});
