<script setup lang="ts">
import { useData } from "vitepress"

defineProps<{ screen?: boolean }>()
const { lang } = useData()
</script>

<template>
  <!-- The playground is the site this one is served under, outside VitePress's base. -->
  <a class="oi-playground" :class="{ 'oi-playground-screen': screen }" href="/">
    {{ lang.startsWith("zh") ? "演示站" : "Playground" }}
  </a>
</template>
