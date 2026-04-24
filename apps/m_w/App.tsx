//m_w/App.tsx
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { auth, db } from './firebaseConfig';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { format } from 'date-fns';

// Screens
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import CameraScreen from './screens/CameraScreen';

const Stack = createStackNavigator();

export default function App() {
  const [worker, setWorker] = useState<any>(null);
  const [routeData, setRouteData] = useState<any[]>([]);
  const [initializing, setInitializing] = useState(true);

  // 1. Handle Auth Persistence (Session Management)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const q = query(collection(db, 'admin_workers'), where('uid', '==', user.uid));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            setWorker(querySnapshot.docs[0].data());
          } else {
             setWorker(null);
          }
        } catch (error) {
          console.error("Error fetching worker profile:", error);
        }
      } else {
        setWorker(null);
      }
      if (initializing) setInitializing(false);
    });

    return unsubscribe;
  }, [initializing]);

  // 2. Real-time Route Listening (onSnapshot)
  useEffect(() => {
    // We need the worker's email to filter their specific routes
    if (!worker?.email) return;

    const dateStr = format(new Date(), 'yyyy-MM-dd');
    
    // Listen directly to today's document in admin_workersSchedule
    const scheduleRef = doc(db, 'admin_workersSchedule', dateStr);
    
    const unsubscribeSchedule = onSnapshot(scheduleRef, (scheduleSnap) => {
      if (scheduleSnap.exists()) {
        const data = scheduleSnap.data();
        const allAssignedRoutes = data.assignedRoute || [];
        
        // Filter the array to only include jobs assigned to the logged-in worker's email
        const workerSpecificRoutes = allAssignedRoutes.filter(
          (job: any) => job.email === worker.email
        );
        
        setRouteData(workerSpecificRoutes);
      } else {
        // If there is no document for today, clear the route data
        setRouteData([]);
      }
    });

    return () => unsubscribeSchedule();
  }, [worker]);

  if (initializing) return null; // Or a splash screen

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!worker ? (
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLogin={setWorker} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Dashboard">
              {(props) => (
                <DashboardScreen 
                  {...props} 
                  worker={worker} 
                  routes={routeData} 
                  onLogout={() => auth.signOut()} 
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Camera" component={CameraScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}