package com.hexlands.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Navy = Color(0xFF0A2A62)
val NavyDark = Color(0xFF071E4C)
val NavyLight = Color(0xFF123A82)
val Gold = Color(0xFFFFD23F)
val Foam = Color(0xFFE8F1FB)
val FoamDim = Color(0xFFB9CCE6)
val Good = Color(0xFF4CD964)
val Bad = Color(0xFFFF6B6B)

private val Scheme = darkColorScheme(
    primary = Gold, onPrimary = Color(0xFF3A2A00),
    secondary = Color(0xFF4CC9F0), onSecondary = Color(0xFF00212B),
    background = Navy, onBackground = Foam,
    surface = NavyLight, onSurface = Foam,
    surfaceVariant = Color(0xFF1B4A9A), onSurfaceVariant = FoamDim,
    error = Bad,
)

@Composable
fun HexlandsTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = Scheme) {
    // Everything sits on the sea-blue surface, so text is light by default.
    Surface(color = Navy, contentColor = Foam, content = content)
}
