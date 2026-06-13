export type StorageUnavailableBannerProps = {
  /** True when the failure is an unopenable database that deleting can recover. */
  resettable: boolean;
  /** Delete the local database and reload. Only reachable when resettable. */
  onReset: () => void | Promise<void>;
};
