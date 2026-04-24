//m_w/App.tsx

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { auth, db } from './firebaseConfig';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
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
          const workerDoc = await getDoc(doc(db, 'workers', user.uid));
          if (workerDoc.exists()) {
            setWorker(workerDoc.data());
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
    if (!worker?.name) return;

    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const periods = ['Morning', 'Afternoon', 'Evening'];
    
    // Listen to the daily worker schedule to see if they are assigned
    const scheduleRef = doc(db, 'admin_workersSchedule', dateStr);
    
    const unsubscribeSchedule = onSnapshot(scheduleRef, (scheduleSnap) => {
      if (scheduleSnap.exists() && scheduleSnap.data().workers?.includes(worker.name)) {
        
        // If assigned, setup listeners for each time period's route
        const unsubscribers = periods.map((period) => {
          const docRef = doc(db, 'schedule', `${dateStr}_${period}`);
          
          return onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              const newData = docSnap.data().bookings || []; // Assuming your field name is 'bookings'
              
              setRouteData((prev) => {
                // Filter out old data for this specific period and replace with fresh data
                const otherPeriods = prev.filter(item => item.period !== period);
                const periodData = newData.map((b: any) => ({ ...b, period }));
                return [...otherPeriods, ...periodData];
              });
            }
          });
        });

        return () => unsubscribers.forEach(unsub => unsub());
      } else {
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