function perlin_draw3d(image_mat, ifi, loop)

if ( nargin < 2 || isempty(ifi) )
  ifi = 1/24;
end

num_frames = size( image_mat, 3 );

ax = gca();
fig = gcf();

do_continue = true;
set( fig, 'KeyPressFcn', @stop_cb );

if ( loop )
  i = 1;
  direction = 1;
  
  while ( do_continue )
    if ( i > num_frames )
      i = max( 1, num_frames-1 );
      direction = -1;
    elseif ( i <= 0 )
      i = min( 2, num_frames );
      direction = 1;
    end
    
    show_frame( ax, image_mat, i, ifi );    
    i = i + direction;
  end
else
  for i = 1:num_frames
    show_frame( ax, image_mat, i, ifi );
    
    if ( ~do_continue )
      break;
    end
  end
end

  function stop_cb(src, event)
    if ( strcmp(event.Key, 'escape') )
      do_continue = false;
    end
  end

end

function show_frame(ax, image_mat, frame, ifi)

imshow( squeeze(image_mat(:, :, frame)) ...
  , 'InitialMagnification', 'fit', 'DisplayRange', [0, 1], 'Parent', ax );

title( ax, sprintf('Frame %d', frame) );

drawnow();
pause( ifi );

end