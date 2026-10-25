import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, initials } from '../theme';

export default function Avatar({ name, color, size = 46, online = false }) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color || '#6C7CFF' },
        ]}
      >
        <Text style={[styles.label, { fontSize: Math.round(size * 0.36) }]}>{initials(name)}</Text>
      </View>
      {online ? <View style={styles.dot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontWeight: '700' },
  dot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.ok,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
