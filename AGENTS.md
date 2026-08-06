# Projex repository instructions

## React UI

- Use `src/components/ModalSelect.tsx` for Mantine select controls rendered inside a `Modal` or another scroll-locked overlay. Do not substitute `NativeSelect` or a raw Mantine `Select` to make component tests easier; update the test interaction instead. Ordinary selects rendered directly on a page can continue to use Mantine `Select`.
