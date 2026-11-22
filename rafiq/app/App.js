import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { AppProvider, useApp } from './src/store';
import { NavProvider } from './src/navigation';
import SetupScreen from './src/screens/SetupScreen';
import AuthScreen from './src/screens/AuthScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import ChatScreen from './src/screens/ChatScreen';
import NewChatScreen from './src/screens/NewChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ChatInfoScreen from './src/screens/ChatInfoScreen';
import { colors, text } from './src/theme';

const SCREENS = {
  chats: ChatsScreen,
  chat: ChatScreen,
  newChat: NewChatScreen,
  settings: SettingsScreen,
  chatInfo: ChatInfoScreen,
};

function Splash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.logo}>رفیق</Text>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

function Root() {
  const { ready, needsSetup, me } = useApp();

  if (!ready) return <Splash />;
  if (needsSetup) return <SetupScreen />;
  if (!me) return <AuthScreen />;

  return (
    <NavProvider initial={{ name: 'chats' }} screens={SCREENS} />
  );
}

export default function App() {
  return (
    <AppProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
      <Root />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 18 },
  logo: { ...text, fontSize: 34, fontWeight: '800', color: colors.accent },
});
