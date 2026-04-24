// m_w/screens/LoginScreen.tsx

import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  KeyboardAvoidingView, 
  Platform, 
  TouchableWithoutFeedback, 
  Keyboard 
} from 'react-native';
import { auth, db } from '../firebaseConfig'; 
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function LoginScreen({ navigation, onLogin }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("Error", "Please fill in all fields");
    
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const q = query(collection(db, 'admin_workers'), where('uid', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const workerData = querySnapshot.docs[0].data();
        onLogin(workerData); 
      } else {
        Alert.alert("Error", "Worker profile not found in database.");
      }
    } catch (error: any) {
      Alert.alert("Login Failed", error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    // KeyboardAvoidingView ensures the UI shifts up when the keyboard appears
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* TouchableWithoutFeedback allows tapping away to dismiss the keyboard */}
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.inner}>
          <Text style={styles.title}>Worker Login</Text>
          
          <TextInput 
            style={styles.input} 
            placeholder="Email" 
            value={email} 
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          
          <TextInput 
            style={styles.input} 
            placeholder="Password" 
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry 
          />
          
          <TouchableOpacity 
            style={[styles.button, { opacity: loading ? 0.7 : 1 }]} 
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? "Logging in..." : "Login"}</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#fff' 
  },
  inner: {
    flex: 1,
    padding: 20,
    // Changed from 'center' to 'flex-start' to move elements up
    justifyContent: 'flex-start', 
    // Added paddingTop to position the title comfortably at the top
    paddingTop: 100, 
  },
  title: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    marginBottom: 40, 
    textAlign: 'center',
    color: '#2c3e50'
  },
  input: { 
    borderWidth: 1, 
    borderColor: '#ddd', 
    padding: 15, 
    borderRadius: 10, 
    marginBottom: 15,
    backgroundColor: '#f9f9f9'
  },
  button: { 
    backgroundColor: '#3498db', 
    padding: 15, 
    borderRadius: 10, 
    alignItems: 'center',
    marginTop: 10
  },
  buttonText: { 
    color: '#fff', 
    fontWeight: 'bold', 
    fontSize: 16 
  }
});