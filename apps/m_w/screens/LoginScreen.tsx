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
  Keyboard,
  ActivityIndicator
} from 'react-native';
import { auth, db } from '../firebaseConfig'; 
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function LoginScreen({ onLogin }: any) {
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
      let errorMessage = "An error occurred during login.";
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
        errorMessage = "Invalid email or password.";
      }
      Alert.alert("Login Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.inner}>
          <Text style={styles.title}>Worker Login</Text>
          
          <Text style={styles.label}>Email Address</Text>
          <TextInput 
            style={styles.input} 
            placeholder="example@vpm.com" 
            value={email} 
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            spellCheck={false}
            /* AUTOFILL CONFIGURATION */
            textContentType="username"        // iOS Intent
            autoComplete="email"              // Android Intent
            importantForAutofill="yes"        // Android Force
            enablesReturnKeyAutomatically={true}
          />
          
          <Text style={styles.label}>Password</Text>
          <TextInput 
            style={styles.input} 
            placeholder="••••••••" 
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry 
            /* AUTOFILL CONFIGURATION */
            textContentType="password"        // iOS Intent
            autoComplete="password"           // Android Intent
            importantForAutofill="yes"        // Android Force
          />
          
          <TouchableOpacity 
            style={[styles.button, { opacity: loading ? 0.8 : 1 }]} 
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, padding: 30, justifyContent: 'flex-start', paddingTop: 120 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 40, color: '#2c3e50' },
  label: { fontSize: 14, fontWeight: '600', color: '#7f8c8d', marginBottom: 8, marginLeft: 4 },
  input: { 
    borderWidth: 1.5, 
    borderColor: '#edf2f7', 
    padding: 18, 
    borderRadius: 12, 
    marginBottom: 20,
    backgroundColor: '#f8fafc',
    fontSize: 16,
    color: '#2d3748'
  },
  button: { 
    backgroundColor: '#3498db', 
    padding: 18, 
    borderRadius: 12, 
    alignItems: 'center',
    marginTop: 20,
    elevation: 4,
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 18 }
});