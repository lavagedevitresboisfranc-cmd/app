import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E5E5E5',
            height: 56,
            paddingBottom: 6,
            paddingTop: 6,
          },
          tabBarActiveTintColor: '#000000',
          tabBarInactiveTintColor: '#A3A3A3',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            letterSpacing: 0.3,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Calendar',
            tabBarIcon: ({ color, size }) => (
              <Feather name="calendar" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="appointments"
          options={{
            title: 'All',
            tabBarIcon: ({ color, size }) => (
              <Feather name="list" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="create"
          options={{
            title: 'New',
            tabBarIcon: ({ color, size }) => (
              <Feather name="plus-circle" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="detail"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="requests"
          options={{
            title: 'Requests',
            tabBarIcon: ({ color, size }) => (
              <Feather name="inbox" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="request-detail"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
});
