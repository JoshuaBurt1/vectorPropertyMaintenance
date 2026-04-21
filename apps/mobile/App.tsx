import React from 'react';
import { StyleSheet, SafeAreaView, StatusBar, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  // REPLACE THIS with your computer's IPv4 address for local testing
  // You can find it by running 'ipconfig' in PowerShell
  const DEV_URL = 'http://192.168.1.15:3000'; 
  const PROD_URL = 'https://vector-property.vercel.app'; // Future production link

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <WebView 
        source={{ uri: __DEV__ ? DEV_URL : PROD_URL }} 
        style={styles.webview}
        // Allows the app to handle "back" swipes/buttons
        allowsBackForwardNavigationGestures
        // Shows a loading indicator on first load
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