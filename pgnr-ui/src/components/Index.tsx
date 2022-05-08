import React, { ChangeEvent, useState } from 'react'

import { useIncomingNostrEvents } from '../context/NostrEventsContext'
import { useNavigate } from 'react-router-dom'

// @ts-ignore
import Heading1 from '@material-tailwind/react/Heading1'
// @ts-ignore
import Heading6 from '@material-tailwind/react/Heading6'
// @ts-ignore
import Input from '@material-tailwind/react/Input'
import * as JesterUtils from '../util/jester'
import { Identity, useSettings } from '../context/SettingsContext'
import { getSession } from '../util/session'
import { pubKeyDisplayName } from '../util/app'

function CreateIdentityStep() {
  return (
    <>
      <div className="flex justify-center">
        <h1 className="text-blue-gray-500 text-6xl font-serif font-bold mt-0 mb-0">Hello, fellow chess player.</h1>
      </div>
    </>
  )
}

function LoginIdentityStep() {
  const settings = useSettings()

  const publicKeyOrNull = settings.identity?.pubkey || null
  return (
    <div className="flex justify-center">
      <h1 className="text-blue-gray-500 text-6xl font-serif font-bold mt-0 mb-0">
        {`Welcome back, ${publicKeyOrNull}.`}
      </h1>
    </div>
  )
}

function IdentityStep() {
  const settings = useSettings()

  const publicKeyOrNull = settings.identity?.pubkey || null

  if (publicKeyOrNull === null) {
    return CreateIdentityStep()
  } else {
    return LoginIdentityStep()
  }
}

function SetupCompleteStep({ identity }: { identity: Identity }) {
  const settings = useSettings()

  return (
    <div className="flex justify-center">
      <h1 className="text-blue-gray-500 text-6xl font-serif font-bold mt-0 mb-0">
        {`Welcome back, ${pubKeyDisplayName(identity.pubkey)}.`}
      </h1>
    </div>
  )
}

export default function Index() {
  const navigate = useNavigate()
  const incomingNostr = useIncomingNostrEvents()
  const settings = useSettings()

  const identity = settings.identity || null
  const privateKeyOrNull = getSession()?.privateKey || null

  const showIdentityStep = identity === null || privateKeyOrNull === null
  /*
  const [searchInputValue, setSearchInputValue] = useState<string>('')
  const [searchResults, setSearchResults] = useState<string[] | null>(null)
  const [inputIsJesterId, setInputIsJesterId] = useState<boolean | null>(null)

  const search = (searchInput: string) => {
    if (!searchInput) {
      setSearchResults([])
      return
    }

    // currently, the search value must be a jester id
    const indexOfPrefix = searchInput.indexOf(JesterUtils.JESTER_ID_PREFIX + '1')
    if (indexOfPrefix < 0) {
      setInputIsJesterId(false)
      setSearchResults([])
      return
    }

    // try finding a jesterId in the input, e.g. might be an url "https://example.com/jester1abcdef123..."
    const possibleJesterId = searchInput.substring(indexOfPrefix)
    console.debug(`Found possible jesterId: ${possibleJesterId}`)

    const jesterId = JesterUtils.tryParseJesterId(possibleJesterId as JesterUtils.JesterId)
    if (jesterId === null) {
      console.warn('Could not parse jesterId from search input value')
      setSearchResults([])
      setInputIsJesterId(false)
      return
    }

    // at the moment, just redirect to the game - may not exist, but thats fine for now
    setInputIsJesterId(true)
    setSearchResults(null)
    navigate(`/redirect/game/${jesterId}`)
  }

  const onSearchButtonClicked = () => {
    search(searchInputValue)
  }

  const onSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchInputValue(e.target.value)
    setInputIsJesterId(null)
    setSearchResults(null)
  }*/

  return (
    <div className="screen-index">
      <div className="flex justify-center items-center">
        <div className="w-full grid grid-cols-1">
          {!incomingNostr && (
            <div className="flex justify-center my-4">
              <div>No connection to nostr</div>
            </div>
          )}
          {showIdentityStep ? <IdentityStep /> : <SetupCompleteStep identity={identity} />}
        </div>
      </div>
    </div>
  )
}
