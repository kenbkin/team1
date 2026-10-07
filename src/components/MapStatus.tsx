type MapStatusProps = {
  failed: boolean
}

export default function MapStatus({ failed }: MapStatusProps) {
  return (
    <div className="map-status" role={failed ? 'alert' : 'status'}>
      <p>
        {failed
          ? 'The map could not initialize. Check your connection and reload the page.'
          : 'Loading map…'}
      </p>
    </div>
  )
}
