import { testProp, fc } from 'ava-fast-check'

/**
 * Library under test
 */

import { configureLernaManifest } from '../../src/index'

testProp.skip(
    'TODO: property-test configure-lerna-manifest',
    [
        // arbitraries
        fc.nat(),
    ],
    (
        t,
        // test arguments
        natural,
    ) => {
        // ava test here
    },
    {
        verbose: true,
    },
)
