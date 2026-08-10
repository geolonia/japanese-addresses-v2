export type RsdtFlagCorrection = {
  rsdt: true | undefined;
  correction: 'to_true' | 'to_false' | undefined;
};

export function correctRsdtFlag(hasRsdtData: boolean, currentRsdt: true | undefined): RsdtFlagCorrection {
  if (hasRsdtData && currentRsdt !== true) {
    return { rsdt: true, correction: 'to_true' };
  }
  if (!hasRsdtData && currentRsdt === true) {
    return { rsdt: undefined, correction: 'to_false' };
  }
  return { rsdt: currentRsdt, correction: undefined };
}
