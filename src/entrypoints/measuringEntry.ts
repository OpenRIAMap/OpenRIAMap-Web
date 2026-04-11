export async function loadMeasuringModuleBundle() {
  const [measuringModule, measurementToolsModule] = await Promise.all([
    import('@/components/Mapping/core/MeasuringModule'),
    import('@/components/Mapping/core/Mtools'),
  ]);

  return {
    MeasuringModule: measuringModule.default,
    MeasurementToolsModule: measurementToolsModule.default,
    MeasuringModuleTypes: {
      // 仅供后续按需接入时做轻量类型探测使用
      hasDefaultExport: !!measuringModule.default,
      hasToolsExport: !!measurementToolsModule.default,
    },
  };
}
