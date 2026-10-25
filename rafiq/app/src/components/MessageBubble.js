import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File as ExFile, Paths } from 'expo-file-system';
import { colors, text, row, timeLabel, formatSize } from '../theme';
import { base64ToBytes, bytesToBase64, decryptFile } from '../crypto';
import { downloadFileBase64 } from '../api';

const EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

function FileMessage({ msg, bubbleColor }) {
  const [uri, setUri] = useState(null);
  const [busy, setBusy] = useState(false);
  const isImage = String(msg.mime || '').startsWith('image/');

  const load = async () => {
    if (busy || uri) return;
    setBusy(true);
    try {
      const cipher = await downloadFileBase64(msg.fileId);
      const key = base64ToBytes(msg.fileKey);
      const plain = decryptFile(key, msg.fileId, base64ToBytes(cipher));

      if (isImage) {
        setUri(`data:${msg.mime};base64,${bytesToBase64(plain)}`);
      } else {
        const safe = String(msg.name || 'file').replace(/[^\w.\-؀-ۿ]+/g, '_');
        const file = new ExFile(Paths.cache, `${msg.fileId}-${safe}`);
        file.write(plain);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
      }
    } catch (e) {
      Alert.alert('خطا', e.message || 'باز کردن فایل ممکن نشد');
    } finally {
      setBusy(false);
    }
  };

  if (isImage) {
    return (
      <TouchableOpacity onPress={load} activeOpacity={0.85}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: bubbleColor }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.imageHint}>برای دریافت عکس بزن</Text>}
            <Text style={styles.imageMeta}>📎 {formatSize(msg.size || 0)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[row, styles.fileRow]} onPress={load} activeOpacity={0.7}>
      <Text style={styles.fileIcon}>📄</Text>
      <View style={styles.fileMeta}>
        <Text style={styles.fileName} numberOfLines={1}>
          {msg.name || 'فایل'}
        </Text>
        <Text style={styles.fileSize}>{busy ? 'در حال دریافت…' : formatSize(msg.size || 0)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MessageBubble({ msg, mine, sender, showSender, reactions, onReact, onReply, readByOthers }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const bubbleColor = mine ? colors.bubbleOut : colors.bubbleIn;
  const align = mine ? 'flex-start' : 'flex-end';

  const longPress = () => {
    if (msg.pending) return;
    setPickerOpen((v) => !v);
  };

  let body;
  if (msg.pending) {
    body = <Text style={styles.locked}>🔒 پیام رمزگذاری‌شده — کلید این گفتگو هنوز به دستت نرسیده</Text>;
  } else if (msg.t === 'file') {
    body = <FileMessage msg={msg} bubbleColor={bubbleColor} />;
  } else if (msg.t === 'reaction') {
    return null;
  } else {
    body = (
      <>
        {msg.replyTo ? (
          <View style={[styles.quote, { borderRightColor: colors.accent }]}>
            <Text style={styles.quoteText} numberOfLines={2}>
              {msg.replyPreview || 'پیامی که پاسخ داده شده'}
            </Text>
          </View>
        ) : null}
        <Text style={styles.bodyText}>{msg.text}</Text>
      </>
    );
  }

  return (
    <View style={[styles.wrapper, { alignItems: align }]}>
      {showSender && sender ? (
        <Text style={[styles.sender, { color: sender.avatarColor }]}>{sender.displayName}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.bubble, { backgroundColor: bubbleColor }]}
        onLongPress={longPress}
        delayLongPress={300}
        activeOpacity={0.85}
      >
        {body}
        <View style={[row, styles.footer]}>
          <Text style={styles.time}>{msg.pending ? '' : timeLabel(msg.createdAt)}</Text>
          {mine && !msg.pending ? <Text style={styles.ticks}>{readByOthers ? '✓✓' : '✓'}</Text> : null}
        </View>
      </TouchableOpacity>

      {reactions?.length ? (
        <View style={[row, styles.reactions]}>
          {reactions.map((r) => (
            <View key={r.emoji} style={styles.reactionChip}>
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {pickerOpen ? (
        <View style={[row, styles.picker]}>
          {EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.pickerItem}
              onPress={() => {
                setPickerOpen(false);
                onReact?.(msg.id, emoji);
              }}
            >
              <Text style={styles.pickerEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => {
              setPickerOpen(false);
              onReply?.(msg);
            }}
          >
            <Text style={styles.pickerEmoji}>↩️</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: 10, marginVertical: 3 },
  sender: { ...text, fontSize: 12.5, fontWeight: '700', marginBottom: 2, marginHorizontal: 10 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingTop: 6,
    paddingBottom: 4,
  },
  bodyText: { ...text, fontSize: 15, lineHeight: 22 },
  locked: { ...text, fontSize: 13, color: colors.textDim, maxWidth: 240 },
  footer: { justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  time: { ...text, fontSize: 10.5, color: 'rgba(255,255,255,0.55)' },
  ticks: { ...text, fontSize: 11, color: 'rgba(255,255,255,0.75)' },
  quote: {
    borderRightWidth: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    padding: 6,
    marginBottom: 6,
  },
  quoteText: { ...text, fontSize: 12.5, color: colors.accent },
  reactions: { marginTop: 3, gap: 4 },
  reactionChip: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  reactionEmoji: { fontSize: 13 },
  picker: {
    backgroundColor: colors.surface2,
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginTop: 6,
    gap: 2,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  pickerItem: { paddingHorizontal: 7, paddingVertical: 4 },
  pickerEmoji: { fontSize: 20 },
  image: { width: 230, height: 230, borderRadius: 12 },
  imagePlaceholder: {
    width: 230,
    height: 130,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imageHint: { ...text, fontSize: 13, color: '#fff' },
  imageMeta: { ...text, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  fileRow: { gap: 10, paddingVertical: 6, paddingHorizontal: 4 },
  fileIcon: { fontSize: 26 },
  fileMeta: { flexShrink: 1 },
  fileName: { ...text, fontSize: 14, fontWeight: '600' },
  fileSize: { ...text, fontSize: 11.5, color: colors.textDim, marginTop: 2 },
});
