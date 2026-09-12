import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

const palette = { panel: '#18222E', border: '#303B49', text: '#F7F8FA', muted: '#A7B0BE', gold: '#E4AA38' };

export function MobileButton({ label, onPress, secondary = false, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && styles.dimmed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}

export function MobileInput(props: TextInputProps) {
  return <TextInput {...props} placeholderTextColor={palette.muted} style={[styles.input, props.style]} />;
}

export function MobileCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.gold, marginBottom: 12 },
  secondary: { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border },
  buttonText: { fontSize: 15, fontWeight: '800', color: '#17202B' },
  secondaryText: { color: palette.text },
  dimmed: { opacity: 0.65 },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.panel, paddingHorizontal: 14, color: palette.text, fontSize: 16, marginBottom: 12 },
  card: { borderRadius: 14, backgroundColor: palette.panel, padding: 14, marginBottom: 10 }
});
