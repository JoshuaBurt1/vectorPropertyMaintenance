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

  // Helper to resize and convert to Base64
  const processImage = async (uri: string) => {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 600 } }], // Resize to 600px width
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return manipResult.base64;
  };

  const takePhoto = async (type: 'before' | 'after') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Permission needed");

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
      const jobRef = doc(db, 'jobs', job.id);
      await updateDoc(jobRef, {
        status: 'completed',
        completedAt: new Date(),
        beforeImage: `data:image/jpeg;base64,${beforeBase64}`,
        afterImage: `data:image/jpeg;base64,${afterBase64}`,
      });

      Alert.alert("Success", "Job completed and images saved to Firestore!");
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Document might be too large for Firestore.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Job: {job.address}</Text>
      
      <TouchableOpacity style={styles.photoBox} onPress={() => takePhoto('before')}>
        {beforeBase64 ? 
          <Image source={{ uri: `data:image/jpeg;base64,${beforeBase64}` }} style={styles.img} /> : 
          <Text>Take Before Photo</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.photoBox} onPress={() => takePhoto('after')}>
        {afterBase64 ? 
          <Image source={{ uri: `data:image/jpeg;base64,${afterBase64}` }} style={styles.img} /> : 
          <Text>Take After Photo</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.btn, { backgroundColor: uploading ? '#ccc' : '#2ecc71' }]} 
        onPress={completeJob}
        disabled={uploading}
      >
        <Text style={styles.btnText}>{uploading ? "Saving..." : "Complete Job"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  photoBox: { height: 200, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderRadius: 10 },
  img: { width: '100%', height: '100%', borderRadius: 10 },
  btn: { padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' }
});