//m_w/App.tsx

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { auth, db } from './firebaseConfig';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { format } from 'date-fns';

import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';

const Stack = createStackNavigator();

export default function App() {
  const [worker, setWorker] = useState<any>(null);
  const [routeData, setRouteData] = useState<any[]>([]);
  const [coordinateRoute, setCoordinateRoute] = useState<string[]>([]);
  const [scheduleDocId, setScheduleDocId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // 1. Session Management
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const q = query(collection(db, 'admin_workers'), where('uid', '==', user.uid));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const workerDoc = querySnapshot.docs[0].data();
            setWorker(workerDoc);
          }
        } catch (error) {
          console.error("Error fetching worker profile:", error);
        }
      } else {
        setWorker(null);
        setRouteData([]);
        setCoordinateRoute([]);
      }
      if (initializing) setInitializing(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Real-time Route Listening
  useEffect(() => {
    // Ensure both email and name are available before listening
    if (!worker?.email || !worker?.name) return;

    const dateStr = format(new Date(), 'yyyy-MM-dd');
    setScheduleDocId(dateStr); // Save the document ID to pass to Dashboard for updates
    const scheduleRef = doc(db, 'admin_workersSchedule', dateStr);
    
    const unsubscribeSchedule = onSnapshot(scheduleRef, (scheduleSnap) => {
      if (scheduleSnap.exists()) {
        const data = scheduleSnap.data();
        
        if (data.worker === worker.name) {
          setRouteData(data.assignedRoute || []);
          setCoordinateRoute(data.coordinate_route || []);
        } else {
          setRouteData([]);
          setCoordinateRoute([]);
        }
      } else {
        setRouteData([]);
        setCoordinateRoute([]);
      }
    }, (error) => {
      console.error("Schedule Listener Error:", error);
    });

    return () => unsubscribeSchedule();
  }, [worker?.email, worker?.name]);

  // LOGOUT LOGIC
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setWorker(null);
      setRouteData([]);
      setCoordinateRoute([]);
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  if (initializing) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!worker ? (
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLogin={setWorker} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Dashboard">
            {(props) => (
              <DashboardScreen 
                {...props} 
                worker={worker} 
                routes={routeData} 
                coordinateRoute={coordinateRoute}
                scheduleDocId={scheduleDocId}
                onLogout={handleLogout} 
              />
            )}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}