//mobile_worker/App.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { db } from './firebaseConfig';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';

// Screens
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import CameraScreen from './screens/CameraScreen';

const Stack = createStackNavigator();

export default function App() {
  const [worker, setWorker] = useState<any>(null);
  const [routeData, setRouteData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (workerName: string) => {
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    
    // 1. Check Schedule Assignment
    const scheduleRef = doc(db, 'admin_workersSchedule', dateStr);
    const scheduleSnap = await getDoc(scheduleRef);
    
    if (scheduleSnap.exists() && scheduleSnap.data().workers.includes(workerName)) {
      // 2. Fetch Combined Documents
      const periods = ['Morning', 'Afternoon', 'Evening'];
      let combinedRoutes: any[] = [];
      
      for (const period of periods) {
        const docRef = doc(db, 'schedule', `${dateStr}_${period}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          combinedRoutes.push(...docSnap.data().routes || []);
        }
      }
      setRouteData(combinedRoutes);
    } else {
      setRouteData([]);
    }
  }, []);

  // 15-minute polling
  useEffect(() => {
    if (!worker) return;

    fetchData(worker.name);
    const interval = setInterval(() => fetchData(worker.name), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [worker, fetchData]);

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
                  onLogout={() => setWorker(null)} 
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