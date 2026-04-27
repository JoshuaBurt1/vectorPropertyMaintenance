// apps/m_w/DashboardScreen.tsx

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { format } from 'date-fns';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface Job {
  address: string;
  service: string;
  email: string;
  status?: string;
  period?: string;
  location?: [number, number];
  lat: number;
  lng: number;
  originalIndex: number;
}

export default function DashboardScreen({ worker, routes, coordinateRoute, scheduleDocId, onLogout }: any) {
  const [isReady, setIsReady] = useState(false);
  const webViewRef = useRef<WebView>(null); 
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // 1. SAFE INITIALIZATION
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true); 
    }, 1000); 
    return () => clearTimeout(timer);
  }, []);

  // 2. DATA NORMALIZATION
  const formattedRoutes = useMemo(() => {
    return (routes || [])
      .map((job: any, index: number) => ({
        ...job,
        originalIndex: index, // Track original index for Firestore array updates
        lat: job.lat || (Array.isArray(job.location) ? job.location[0] : 0),
        lng: job.lng || (Array.isArray(job.location) ? job.location[1] : 0),
      }))
      .filter((job: any) => job.lat !== 0 && job.lng !== 0)
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
  }, [routes]);

  const leafletHTML = useMemo(() => {
    // Parse coordinate_route (which is ["lng,lat"]) into [[lat, lng]] for Leaflet polyline
    const polylineCoords = (coordinateRoute || []).map((coordStr: string) => {
      const [lng, lat] = coordStr.split(',').map(Number);
      return [lat, lng];
    });

    const routePolylineString = JSON.stringify(polylineCoords);

    // Generate custom numbered markers
    const markersJS = formattedRoutes.map((j: any, i: number) => {
      let color = '#95a5a6'; // Default Gray
      if (j.status === 'completed') color = '#2ecc71'; // Green
      else if (j.period === 'morning') color = '#f39c12'; // Orange
      else if (j.period === 'afternoon') color = '#3498db'; // Blue
      else if (j.period === 'evening') color = '#9b59b6'; // Purple

      const isSelected = selectedIndex === i;
      const size = isSelected ? 32 : 24;
      const border = isSelected ? 'border: 3px solid #333;' : 'border: 2px solid #fff;';
      const zIndexOffset = isSelected ? 1000 : 0;

      return `
        var icon${i} = L.divIcon({
          className: 'custom-numbered-marker',
          html: "<div style='background-color:${color}; width:${size}px; height:${size}px; border-radius:50%; ${border} display:flex; justify-content:center; align-items:center; color:white; font-weight:bold; font-size:${isSelected ? '14px' : '12px'}; box-shadow: 0 2px 5px rgba(0,0,0,0.3);'>${j.originalIndex + 1}</div>",
          iconSize: [${size}, ${size}],
          iconAnchor: [${size/2}, ${size/2}]
        });
        L.marker([${j.lat}, ${j.lng}], { icon: icon${i}, zIndexOffset: ${zIndexOffset} }).addTo(map);
      `;
    }).join('');

    return `
      <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
            <style>
              body { margin: 0; padding: 0; }
              #map { height: 100vh; width: 100vw; background: #f8f9fa; }
              .leaflet-control-attribution { display: none; }
              
              /* --- NEW: Pulsing White Dot CSS --- */
              .user-gps-icon { background: transparent; border: none; }
              .pulsing-dot {
                width: 14px;
                height: 14px;
                background-color: white;
                border-radius: 50%;
                box-shadow: 0 0 6px rgba(0,0,0,0.6);
                position: relative;
              }
              .pulsing-dot::after {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: rgba(255, 255, 255, 0.8);
                border-radius: 50%;
                animation: pulse 1.5s infinite ease-out;
                z-index: -1;
              }
              @keyframes pulse {
                0% { transform: scale(1); opacity: 1; }
                100% { transform: scale(3.5); opacity: 0; }
              }
            </style>
          </head>
          <body>
            <div id="map"></div>
            <script>
              var map = L.map('map', { zoomControl: false });
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
              
              var routePolyline = ${routePolylineString};
              if (routePolyline.length > 0) {
                var polyline = L.polyline(routePolyline, {color: '#2980b9', weight: 5, opacity: 0.8}).addTo(map);
                map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
              } else if (${formattedRoutes.length} > 0) {
                var bounds = L.latLngBounds(${JSON.stringify(formattedRoutes.map((j: any) => [j.lat, j.lng]))});
                map.fitBounds(bounds, { padding: [40, 40] });
              }
              
              ${markersJS}

              /* --- NEW: GPS Tracking Logic --- */
              var userMarker = null;
              var userIcon = L.divIcon({
                className: 'user-gps-icon',
                html: '<div class="pulsing-dot"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
              });

              // Ask Leaflet to track location continuously
              map.locate({ watch: true, enableHighAccuracy: true });

              map.on('locationfound', function(e) {
                if (!userMarker) {
                  userMarker = L.marker(e.latlng, { icon: userIcon, zIndexOffset: 9999 }).addTo(map);
                } else {
                  userMarker.setLatLng(e.latlng); // Update position as user moves
                }
              });

              map.on('locationerror', function(e) {
                console.log("GPS mapping error: " + e.message);
              });
            </script>
          </body>
        </html>
    `;
  }, [formattedRoutes, selectedIndex, coordinateRoute]);

  // 3. EVENT HANDLERS
  const handleJobPress = (job: any, index: number) => {
    setSelectedIndex(index);
    const flyToCode = `
      map.setView([${job.lat}, ${job.lng}], 16, {
        animate: true,
        duration: 1.0
      });
    `;
    webViewRef.current?.injectJavaScript(flyToCode);
  };

  const handleCompleteJob = async (originalIndex: number) => {
    if (!scheduleDocId) return;
    try {
      // Create a shallow copy of the exact routes array passed from Firebase
      const updatedRoutes = [...routes];
      updatedRoutes[originalIndex].status = 'completed';

      const scheduleRef = doc(db, 'admin_workersSchedule', scheduleDocId);
      await updateDoc(scheduleRef, {
        assignedRoute: updatedRoutes
      });
      
      Alert.alert("Success", "Job marked as completed!");
    } catch (error) {
      console.error("Error completing job:", error);
      Alert.alert("Error", "Could not update job status.");
    }
  };

  // 4. RENDER GATES
  if (!isReady) {
    return (
      <View style={styles.centered}>
        <Text>Loading System Resources...</Text>
        <Text>Establishing GPU Buffer...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Hello,</Text>
          <Text style={styles.workerName}>{worker?.name}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {formattedRoutes.length > 0 ? (
        <View style={{ flex: 1 }}>
          <View style={styles.mapContainer}>
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{ html: leafletHTML }}
              style={styles.map}
              scrollEnabled={false}
              geolocationEnabled={true}
            />
          </View>

          <FlatList
            data={formattedRoutes}
            keyExtractor={(_, i) => i.toString()}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[
                  styles.jobItem,
                  selectedIndex === index && styles.selectedItem
                ]}
                onPress={() => handleJobPress(item, index)}
              >
                <View style={styles.markerBadgeContainer}>
                   <View style={[
                     styles.numberBadge, 
                     { backgroundColor: item.status === 'completed' ? '#2ecc71' : (item.period === 'morning' ? '#f39c12' : item.period === 'afternoon' ? '#3498db' : item.period === 'evening' ? '#9b59b6' : '#95a5a6') }
                   ]}>
                     <Text style={styles.numberBadgeText}>{item.originalIndex + 1}</Text>
                   </View>
                </View>

                <View style={styles.jobInfo}>
                  <Text style={styles.addressText}>{item.address}</Text>
                  <Text style={styles.serviceText}>{item.service} • {item.period ? item.period.charAt(0).toUpperCase() + item.period.slice(1) : 'Anytime'}</Text>
                </View>
                
                <View style={styles.actionContainer}>
                  <View style={[styles.statusBadge, { backgroundColor: item.status === 'completed' ? '#2ecc71' : '#f1c40f' }]}>
                     <Text style={styles.statusText}>{item.status || 'Pending'}</Text>
                  </View>
                  
                  {item.status !== 'completed' && (
                    <TouchableOpacity 
                      style={styles.completeBtn} 
                      onPress={() => handleCompleteJob(item.originalIndex)}
                    >
                      <Text style={styles.completeBtnText}>Complete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.noRouteText}>No route assigned for today.</Text>
          <Text style={styles.dateText}>{format(new Date(), 'MMMM do, yyyy')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfcfc' },
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 60, 
    paddingBottom: 20,
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  welcomeText: { fontSize: 14, color: '#7f8c8d' },
  workerName: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50' },
  logoutBtn: { padding: 8, borderRadius: 8, backgroundColor: '#fff5f5' },
  logoutText: { color: '#e74c3c', fontWeight: '600' },

  mapContainer: { 
    height: Dimensions.get('window').height * 0.4, 
    width: '100%',
    overflow: 'hidden', 
    backgroundColor: '#eee'
  },
  
  map: { 
    height: Dimensions.get('window').height * 0.4, 
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },

  listContent: { padding: 15 },
  jobItem: { 
    padding: 18, 
    borderRadius: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  selectedItem: {
    borderColor: '#3498db',
    borderWidth: 2,
    backgroundColor: '#f0f9ff'
  },
  
  markerBadgeContainer: {
    marginRight: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },

  jobInfo: { flex: 1 },
  addressText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  serviceText: { color: '#7f8c8d', marginTop: 4, fontSize: 13 },
  
  actionContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  completeBtn: {
    backgroundColor: '#3498db',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  completeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noRouteText: { fontSize: 18, color: '#95a5a6', fontWeight: '500' },
  dateText: { color: '#bdc3c7', marginTop: 8 }
});