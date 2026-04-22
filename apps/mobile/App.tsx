import React from 'react';
import { StyleSheet, SafeAreaView, StatusBar, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  const DEV_URL = 'http://192.168.1.15:3000'; 
  const PROD_URL = "https://vector-property-maintenance.web.app";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <WebView 
        source={{ uri: __DEV__ ? DEV_URL : PROD_URL }} 
        style={styles.webview}
        allowsBackForwardNavigationGestures
        startInLoadingState
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    // Ensures content doesn't overlap with the status bar/notch
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  webview: {
    flex: 1,
  },
});