import React from 'react';
import { View, StyleSheet } from 'react-native';

// Renders small flag icons using pure colored shapes (no external assets, cross-platform).
// QC = blue with 4 fleur-de-lis white crosses
// US = red/white stripes with blue canton
// ES = red/yellow/red horizontal bands
export function FlagQC({ size = 24 }: { size?: number }) {
  const w = size;
  const h = size * 0.66;
  return (
    <View style={[styles.base, { width: w, height: h, backgroundColor: '#0072CE' }]}>
      <View style={styles.qcCross} />
      <View style={styles.qcCrossH} />
    </View>
  );
}

export function FlagUS({ size = 24 }: { size?: number }) {
  const w = size;
  const h = size * 0.66;
  const stripeH = h / 7;
  return (
    <View style={[styles.base, { width: w, height: h, backgroundColor: '#fff' }]}>
      {[0, 2, 4, 6].map((i) => (
        <View key={i} style={{ position: 'absolute', top: i * stripeH, left: 0, right: 0, height: stripeH, backgroundColor: '#B22234' }} />
      ))}
      <View style={{ position: 'absolute', top: 0, left: 0, width: w * 0.4, height: stripeH * 4, backgroundColor: '#3C3B6E' }} />
    </View>
  );
}

export function FlagES({ size = 24 }: { size?: number }) {
  const w = size;
  const h = size * 0.66;
  return (
    <View style={[styles.base, { width: w, height: h }]}>
      <View style={{ flex: 1, backgroundColor: '#AA151B' }} />
      <View style={{ flex: 2, backgroundColor: '#F1BF00' }} />
      <View style={{ flex: 1, backgroundColor: '#AA151B' }} />
    </View>
  );
}

export function Flag({ code, size = 24 }: { code: string; size?: number }) {
  if (code === 'fr') return <FlagQC size={size} />;
  if (code === 'en') return <FlagUS size={size} />;
  if (code === 'es') return <FlagES size={size} />;
  return <FlagQC size={size} />;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  qcCross: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '47%',
    width: '6%',
    backgroundColor: '#fff',
  },
  qcCrossH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '47%',
    height: '6%',
    backgroundColor: '#fff',
  },
});
