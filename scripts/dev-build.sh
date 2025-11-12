#!/bin/sh
pnpm build

pnpm i

cd sample

pnpm install --config.confirmModulesPurge=false # config.confirmModulesPurge=false turns off the need for confirmation ot install.
