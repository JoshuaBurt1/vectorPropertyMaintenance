//m_w/screens/CameraScreen.tsx

import React, { useState } from 'react';
import { View, TouchableOpacity, Image, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { db } from '../firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';

export default function CameraScreen({ route, navigation }: any) {
  const { job } = route.params;
  const [beforeBase64, setBeforeBase64] = useState<string | null>(null);
  const [afterBase64, setAfterBase64] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Aggressive compression for Firestore storage
  const processImage = async (uri: string) => {
    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 300 } }], // Reduced from 600 to 300
        { 
          compress: 0.3, // Reduced from 0.6 to 0.3 (very aggressive)
          format: ImageManipulator.SaveFormat.JPEG, 
          base64: true 
        }
      );
      return manipResult.base64;
    } catch (error) {
      console.error("Image processing failed:", error);
      return null;
    }
  };

  const takePhoto = async (type: 'before' | 'after') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Permission needed");

    // launchCameraAsync quality at 0.1 helps initial memory usage
    const result = await ImagePicker.launchCameraAsync({ quality: 0.1 });
    
    if (!result.canceled) {
      const base64 = await processImage(result.assets[0].uri);
      if (type === 'before') setBeforeBase64(base64 || null);
      else setAfterBase64(base64 || null);
    }
  };

  const completeJob = async () => {
    if (!beforeBase64 || !afterBase64) return Alert.alert("Please take both photos");
    setUploading(true);

    try {
      // Note: Ensure your 'job' object has a valid 'id' property
      const jobRef = doc(db, 'jobs', job.id);
      
      await updateDoc(jobRef, {
        status: 'completed',
        completedAt: new Date(),
        // Storing as Base64 data strings
        beforeImage: `data:image/jpeg;base64,${beforeBase64}`,
        afterImage: `data:image/jpeg;base64,${afterBase64}`,
      });

      Alert.alert("Success", "Job completed!");
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      // Helpful error message for debugging Firestore limits
      if (e.message?.includes('too large')) {
        Alert.alert("Error", "Image data is still too large. Try taking the photo again.");
      } else {
        Alert.alert("Error", "Failed to save job. Check your Firestore rules.");
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Job: {job.address}</Text>
      
      <Text style={styles.label}>Before Service</Text>
      <TouchableOpacity style={styles.photoBox} onPress={() => takePhoto('before')}>
        {beforeBase64 ? 
          <Image source={{ uri: `data:image/jpeg;base64,${beforeBase64}` }} style={styles.img} /> : 
          <Text>📸 Take Before Photo</Text>
        }
      </TouchableOpacity>

      <Text style={styles.label}>After Service</Text>
      <TouchableOpacity style={styles.photoBox} onPress={() => takePhoto('after')}>
        {afterBase64 ? 
          <Image source={{ uri: `data:image/jpeg;base64,${afterBase64}` }} style={styles.img} /> : 
          <Text>📸 Take After Photo</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.btn, { backgroundColor: uploading ? '#ccc' : '#2ecc71' }]} 
        onPress={completeJob}
        disabled={uploading}
      >
        <Text style={styles.btnText}>{uploading ? "Saving Job..." : "Complete Job"}</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fff' },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  label: { fontSize: 14, color: '#666', marginBottom: 5 },
  photoBox: { 
    height: 200, 
    backgroundColor: '#f0f0f0', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20, 
    borderRadius: 10,
    overflow: 'hidden'
  },
  img: { width: '100%', height: '100%' },
  btn: { padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});